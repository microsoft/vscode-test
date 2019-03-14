"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var cp = require("child_process");
function runTests(vscodeExecutablePath, extPath, testPath, testWorkspace) {
    return new Promise(function (resolve, reject) {
        var args = [
            testWorkspace,
            '--extensionDevelopmentPath=' + extPath,
            '--extensionTestsPath=' + testPath,
            '--locale=en'
        ];
        var cmd = cp.spawn(vscodeExecutablePath, args);
        cmd.stdout.on('data', function (data) {
            var s = data.toString();
            if (!s.includes('update#setState idle')) {
                console.log(s);
            }
        });
        cmd.on('error', function (data) {
            console.log('Test error: ' + data.toString());
        });
        cmd.on('close', function (code) {
            console.log("Exit code:   " + code);
            if (code !== 0) {
                reject('Failed');
            }
            console.log('Done\n');
            resolve(code);
        });
    });
}
exports.runTests = runTests;
