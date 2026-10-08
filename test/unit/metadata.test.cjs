const test=require('node:test'),assert=require('node:assert/strict');
const {validManifestIcon}=require('../../dist/watch/metadata.js');
test('accepts local raster icon paths only',()=>{
  assert.equal(validManifestIcon('images/icon.png'),true);
  assert.equal(validManifestIcon('assets/image.webp'),true);
  assert.equal(validManifestIcon('logo.jpg'),true);
  for(const x of ['../icon.png','/etc/passwd','https://example.com/foo.png','images/../foo.png',
    'assets\\icon.png','icon.svg','foo.js','icon.png?token=abc','',null]){
    assert.equal(validManifestIcon(x),false,String(x));
  }
});
