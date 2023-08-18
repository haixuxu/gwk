
// @ts-ignore
import stringWidth from 'string-width';

let isFirstStatusPrinted = false;

let lastMsg = '';

function getLastMsgLines() {
    const columns = process.stdout.columns;
    const lines = lastMsg.split('\n');
    let count = 0;
    lines.forEach((line: string) => {
        count++;

        const len = stringWidth(line);
        if (len > columns) {
            count += Math.floor(len / columns);
        }
    });

    return count;
}

var printer = {
    printStatus(message: string) {
        if (!isFirstStatusPrinted) {
            isFirstStatusPrinted = true;
            process.stdout.write('\n');
        } else {
            const lines = getLastMsgLines();
            for (var i = 0; i < lines; i++) {
                if (i !== 0) {
                    process.stdout.moveCursor(0, -1); // 1b5b3141
                }
                process.stdout.clearLine(0); // 1b5b304b
            }
        }
        process.stdout.cursorTo(0); // == process.stdout.write(Buffer.from('1b5b3130303044','hex))
        process.stdout.write(message);
        lastMsg = message;
    },
};

export default printer;
