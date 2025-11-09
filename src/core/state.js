import{el}from'../lib/dom.js';
export const state=window.state={messages:[],busy:false,controller:null,currentThreadId:null,abortRequested:false,attachments:[],stream:{rid:null,bubble:null,meta:null,text:'',done:false}}
export function clearChat(){el.suneHtml.dispatchEvent(new CustomEvent('sune:unmount'));state.messages=[];el.messages.innerHTML='';state.attachments=[];el.fileInput.value=''}
