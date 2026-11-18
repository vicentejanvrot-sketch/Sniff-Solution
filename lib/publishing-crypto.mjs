import {createCipheriv,createDecipheriv,randomBytes} from 'node:crypto';
function keyBytes(value){
 if(typeof value!=='string'||! /^[A-Za-z0-9+/]{43}=$/.test(value))throw new Error('A base64-encoded 32-byte publishing key is required.');
 const key=Buffer.from(value,'base64');if(key.length!==32)throw new Error('Invalid publishing key.');return key;
}
function context(account){if(typeof account!=='string'||!account)throw new Error('Account context required.');return Buffer.from('sniff:instagram:v1:'+account);}
export function encryptToken(token,key,account){
 if(typeof token!=='string'||!token)throw new Error('Token required.');
 const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',keyBytes(key),iv);
 cipher.setAAD(context(account));
 const data=Buffer.concat([cipher.update(token,'utf8'),cipher.final()]);
 return ['v1',iv.toString('base64url'),cipher.getAuthTag().toString('base64url'),data.toString('base64url')].join('.');
}
export function decryptToken(value,key,account){
 const parts=String(value).split('.');
 if(parts.length!==4||parts[0]!=='v1'||parts.slice(1).some(p=>! /^[A-Za-z0-9_-]+$/.test(p)))throw new Error('Invalid encrypted token.');
 const [,iv,tag,data]=parts.map((p,i)=>i?Buffer.from(p,'base64url'):p);
 if(iv.length!==12||tag.length!==16)throw new Error('Invalid encrypted token.');
 const decipher=createDecipheriv('aes-256-gcm',keyBytes(key),iv);
 decipher.setAAD(context(account));decipher.setAuthTag(tag);
 return Buffer.concat([decipher.update(data),decipher.final()]).toString('utf8');
}
