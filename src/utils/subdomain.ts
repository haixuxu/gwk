const CHARS = '0123456789abcdefghighlmnopqrstwvuxyz';

function genSubdomain(): string {
    let str = CHARS.slice(10)[Math.floor(Math.random() * 26)];
    for (var i = 0; i < 15; i++) {
        let char = CHARS[Math.floor(Math.random() * 36)];
        str += char;
    }

    return str;
}

export { genSubdomain };
