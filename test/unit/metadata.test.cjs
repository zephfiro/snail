const test=require('node:test'),assert=require('node:assert/strict');
const Module=require('node:module');
const load=Module._load;
Module._load=function(req,parent,main){return req==='vscode'?{}:load.call(this,req,parent,main)};
let validManifestIcon;
try{({validManifestIcon}=require('../../dist/watch/metadata.js'))}finally{Module._load=load}
test('accepts local raster icon paths only',()=>{
  assert.equal(validManifestIcon('images/icon.png'),true);
  assert.equal(validManifestIcon('assets/image.webp'),true);
  assert.equal(validManifestIcon('logo.jpg'),true);
  for(const x of ['../icon.png','/etc/passwd','https://example.com/foo.png','images/../foo.png',
    'assets\\icon.png','icon.svg','foo.js','icon.png?token=abc','',null]){
    assert.equal(validManifestIcon(x),false,String(x));
  }
});
