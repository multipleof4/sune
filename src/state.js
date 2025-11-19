export const state={messages:[],busy:false,controller:null,currentThreadId:null,abortRequested:false,attachments:[],stream:{rid:null,bubble:null,meta:null,text:'',done:false}}
export const cacheStore=localforage.createInstance({name:'threads_cache',storeName:'streams_status'})
