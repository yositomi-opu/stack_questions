const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../../app/mcq-webapp/authoring.js'),'utf8');
for(const host of ['localhost','127.0.0.1','[::1]'])for(const tf of [false,true]){
 const inputs=['mcq','prt','stack','parsons','tf'].map((key,i)=>({dataset:{port:key},value:String([4173,4175,4176,4177,4178][i]),checkValidity(){return /^\d+$/.test(this.value)&&Number(this.value)>=1024&&Number(this.value)<=65535;},addEventListener(_,fn){this.update=fn;}}));
 const links=Object.fromEntries(inputs.map(i=>[i.dataset.port,{setAttribute(k,v){this[k]=v;},removeAttribute(k){delete this[k];}}]));
 const tfApp={hidden:true},location=new URL(`http://${host}:8413/authoring.html?prt=8415&stack=bad${tf?'&tf=8418':''}`);let saved;
 vm.runInNewContext(source,{URL,location,history:{replaceState(a,b,url){saved=url;}},document:{getElementById(){return tfApp;},querySelectorAll(){return inputs;},querySelector(q){return links[q.match(/"(.*?)"/)[1]];}}});
 assert.equal(links.mcq.href,`http://${host}:8413/`);assert.equal(links.prt.href,`http://${host}:8415/`);assert.equal(links.stack.href,`http://${host}:4176/`);
 assert.equal(links.tf.href,`http://${host}:${tf?8418:4178}/`);
 assert(saved.includes('prt=8415'));inputs[1].value='';inputs[1].update();assert.equal(links.prt.href,undefined);assert.equal(links.prt['aria-disabled'],'true');inputs[1].value='9415';inputs[1].update();assert.equal(links.prt.href,`http://${host}:9415/`);
}
console.log('PASS authoring index: five editors including TF, custom/default ports, invalid/empty ports, host preservation and bookmark URLs.');
