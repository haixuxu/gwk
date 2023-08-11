export const timeoutPromise = (time:number,msg:string)=>{
    return new Promise((resolve)=>{
        setTimeout(()=>resolve(msg),time)
    })
}