import jsdom from "jsdom";
import amqp from "amqplib";
import fs from "fs";
import { parse } from "csv-parse";

const queue = "users_from_habr";

let users = []
await fs.createReadStream("./habr.csv")
  .pipe(parse({ delimiter: ",", from_line: 2 }))
  .on("data", function (row) {
    users.push({ url: row[0] })
  })
  .on("error", function (error) {
    console.log(error.message);
  })
  .on("end", function () {
    publish(users)
    console.log("read file: finished");
  });

async function parseUsers(users) {
  for (const user of users) {
    let response = await fetch(user.url);
    let responseText = await response.text();

    const dom = new jsdom.JSDOM(responseText)
    const name = dom.window.document.querySelector(".page-title__title").textContent;

    user.name = name;
    user.html = responseText;
  }
}

async function publish(users) {
  await parseUsers(users)

  let connection;
  try {
    connection = await amqp.connect("amqp://guest:guest@localhost:5672/");
    const channel = await connection.createChannel();
    await channel.assertQueue(queue, { durable: true });
    users.forEach((user) => {
      channel.sendToQueue(queue, Buffer.from(JSON.stringify({ url: user.url, name: user.name, html: user.html })));
    })
    await channel.close();
  } catch (err) {
    console.warn(err);
  } finally {
    if (connection) await connection.close();
  }
}
