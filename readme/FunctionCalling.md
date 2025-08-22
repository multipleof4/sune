Sune function call (have Sunes attach files to their latest bubble)

In your Sune script, call:
```js
await window.suneAttach(files, { toAPI: false, tree: true })
```
files can be File objects or simple objects like:
```js
{ name: 'report.pdf', mime: 'application/pdf', data: '<BASE64>', size: 123456 }
```
`toAPI: true` adds an assistant message containing the actual file parts (so the API can consume them next turn).

`tree: true` adds the separate Attachments tree bubble with clickable downloads.


Examples:
```js
await window.suneAttach([fileInput.files[0]])
await window.suneAttach([{name:'cat.png',mime:'image/png',data:'<BASE64>'}])
```
If you want only the tree bubble and not re-send data to the API, set {toAPI:false, tree:true}.
