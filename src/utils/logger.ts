
function dateFormat(formatStr:string, dt?:Date){
    if(!dt){
        dt = new Date();
      }
      const y = dt.getFullYear();
      let M = "0" + (dt.getMonth() + 1);
      M = M.substring(M.length - 2);
      let d = "0" + dt.getDate();
      d = d.substring(d.length - 2);
      let h = "0" + dt.getHours();
      h = h.substring(h.length - 2);
      let m = "0" + dt.getMinutes();
      m = m.substring(m.length - 2);
      let s = "0" + dt.getSeconds();
      s = s.substring(s.length - 2);
      return formatStr.replace('yyyy', String(y)).replace('MM', M).replace('dd', d).replace('HH', h).replace('mm', m).replace('ss', s);
}


export interface Logger {
    fatal: (...msg: any[]) => void;
    error: (...msg: any[]) => void;
    warn: (...msg: any[]) => void;
    info: (...msg: any[]) => void;
    log: (...msg: any[]) => void;
    debug: (...msg: any[]) => void;
}

const levelVal: any= {
    fatal: { piv: 1, colour: '\x1b[31m%s\x1b[0m' },
    error: { piv: 2, colour: '\x1b[31m%s\x1b[0m' },
    warn: { piv: 3, colour: '\x1b[33m%s\x1b[0m' },
    info: { piv: 4, colour: '\x1b[32m%s\x1b[0m' },
    log: { piv: 5, colour: '\x1b[37m%s\x1b[0m' },
    debug: { piv: 6, colour: '\x1b[35m%s\x1b[0m' },
};

function getCustomLogger(label:string, level:string):Logger {
    const noop = () => void 0;
    const setPiv = levelVal[level].piv;
    function getter(_target:unknown, key:string) {
        if (levelVal[key].piv <= setPiv) {
            const colour = levelVal[key].colour;
            return function (...args:any[]) {
                const date = dateFormat('yyyy/MM/dd HH:mm:ss');
                const prefix = `${date} [${key[0].toUpperCase()}] ${label} `;
                console.log(colour, prefix, ...args);
            };
        } else {
            return noop;
        }
    }
    const obj:any= new Proxy({}, { get: getter });
    return obj;
}

export default getCustomLogger
 