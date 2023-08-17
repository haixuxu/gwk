let numOfLinesToClear = false;

var printer = {
    printStatus(message: string, len?: number) {
        len = len || 1;
        if (!numOfLinesToClear) {
            numOfLinesToClear = true;
        } else {
            process.stdout.moveCursor(0, -1 * len);
        }
        process.stdout.clearLine(0);
        process.stdout.cursorTo(0);
        process.stdout.write(message);
    },
};

export default printer;
