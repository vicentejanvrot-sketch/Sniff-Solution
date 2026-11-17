export const fixtureHtml='<html><head><meta name="theme-color" content="#246448"><link rel="stylesheet" href="/brand.css"></head><body><h1>Example Adventures</h1><p>Plan trips and keep itineraries in one place. Organize destinations, bookings and ideas before your next journey.</p><a href="/features">Features</a></body></html>';
export const fixtureCss=':root{--brand-primary:#246448;--brand-accent:#f0b24d;--font-body:"Inter", sans-serif;}body{font-family:Inter,Arial,sans-serif;color:#112233}';
export async function fixtureReader(url,{kind}){
 const u=new URL(url);
 return {url:u.href,text:kind==='css'?fixtureCss:fixtureHtml};
}
export function modelSuggestions(evidence){
 return {palette:['#246448','#F0B24D'],font:'Inter',voice:'Friendly, practical and clear.',audience:'Travellers who want to organize their trip details.',goals:'Encourage visitors to explore the trip planning features.',allowedClaims:[{claim:'Keep trip itineraries together.',evidenceQuote:'Plan trips and keep itineraries in one place.',sourceUrl:evidence.pages[0].url}],prohibitedClaims:['guaranteed savings','100% accurate'],notes:['Audience and goals are recommendations for owner review.']};
}
export function providerResponse(suggestions){
 return {choices:[{message:{content:JSON.stringify(suggestions)},finish_reason:'stop'}],usage:{prompt_tokens:100,completion_tokens:80}};
}

