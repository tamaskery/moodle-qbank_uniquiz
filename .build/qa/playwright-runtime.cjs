// CI uses the runner's installed Chrome. No production browser profile is accessed.
module.exports = {
    chromium: require('../tools/node_modules/playwright-core').chromium,
    edgeExecutable: process.env.UNIQUIZ_CHROME_PATH,
};
