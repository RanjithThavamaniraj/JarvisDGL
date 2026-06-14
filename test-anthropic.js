const Parser = require("rss-parser");
const parser = new Parser();

(async () => {
  try {
    const feed = await parser.parseURL(
      "https://deepmind.google/blog/rss.xml"
    );

    console.log("Feed Title:", feed.title);
    console.log("Latest Article:", feed.items[0]?.title);
    console.log("Link:", feed.items[0]?.link);
  } catch (err) {
    console.error(err);
  }
})();
