export function buildHeader(rawHeaders: any) {
    // 拼装原始头部数据
    const rawHeaderData = rawHeaders.reduce((result: string, header: string, index: number) => {
        if (index % 2 === 0) {
            // 头部名称
            result += header + ': ';
        } else {
            // 头部值
            result += header + '\r\n';
        }
        return result;
    }, '');

    // 加上头部结束标记
    const rawHeaderString = rawHeaderData + '\r\n';
    return rawHeaderString;
}
