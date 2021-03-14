const fs = require("fs");
const path = require("path");
const express = require("express");
const bodyParser = require("body-parser");
const app = express();
const http = require("http").createServer(app);
const PORT = process.env.PORT || 3000;

// handle data in a nice way
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
const publicPath = path.resolve(`${__dirname}/public`);
const socketioPath = path.resolve(`${__dirname}/node_modules/socket.io-client/dist`);

// set your static server
app.use(express.static(publicPath));
app.use(express.static(socketioPath));

// views
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "views/index.html"));
});

// start listening
const server = app.listen(PORT);
console.log("Server is running localhost on port: " + PORT);

// socket.io
const io = require("socket.io")().listen(server);

// Network Traversal
// Could also use network traversal service here (Twilio, for example):
let iceServers = [
  { url: "stun:stun.l.google.com:19302" },
  { url: "stun:stun1.l.google.com:19302" },
  { url: "stun:stun2.l.google.com:19302" },
  { url: "stun:stun3.l.google.com:19302" },
  { url: "stun:stun4.l.google.com:19302" },
];

let clients = {};
let playerList = []; // existing player list in order (name: prize)
let winners = ""; // used to store winners before announcing

const ROUND_STATE = {
  noPlayerExists: 0,
  waitingForOtherPlayers: 1,
  otherUserJoined: 2,
  startingNewRound: 3,
  groundColorChanges: 4,
  roundStarted: 5,
  instruction1: 6,
  instruction2: 7,
  instruction3: 8,
  silence: 9,
  roundFinished: 10,
  announcingWinners: 11,
  announcingFinalWinner: 12
};

let round = {
  colorIndex: 3,
  totalNum: 10, // fixed
  currentNum: 1,
  prize: 1000,
  totalTime: 60, // fixed
  currentTime: 60,
  message: "",
  state: ROUND_STATE.noPlayerExists
};

const ROUND_MESSAGE = {
  noPlayerExists: "",
  waitingForOtherPlayers: "Waiting for other players to join...",
  otherUserJoined: "A new player just joined, the game will start soon...",
  startingNewRound: "Starting a new round...",
  groundColorChanges: "Setting the ground color...",
  roundStarted: () => { return `Round ${round.currentNum} / ${round.totalNum} started!` },
  instruction1: "Match your body color to the ground color by asking other players by the end of the round.",
  instruction2: "You can change your body color by clicking your left mouse button.",
  instruction3: "After each round, the prize money will be distributed to the winner(s).",
  silence: "",
  roundFinished: () => { return `Round ${round.currentNum} / ${round.totalNum} finished!` },
  announcingWinners: () => { return winners ? `Announcing the winner(s): ${winners}` : "No winner was found in this round." },
  announcingFinalWinner: () => { return winners ? `Announcing the final winner(s): ${winners}` : "No final winner was found." }
};

let previousNumClients = 0;
let startTime = 0;
let previousWrappedTime = 0;
let countDownStartTime = 0;
let countDownPreviousWrappedTime = 0;
let shouldCountDown = false;

function updatePlayerList() {
  playerList = [];
  for (const _id in clients) {
    if (clients[_id].name) { // name might not be set yet
      playerList.push({ name: clients[_id].name, prize: clients[_id].prize });
    }
  }
  if (playerList.length) {
    playerList.sort((a, b) => b.prize - a.prize);
    io.sockets.emit("updatePlayerList", playerList);
  }
}

function restartRound() {
  console.log("restarting round...");
  for (const _id in clients) {
    const colorIndex = Math.floor(Math.random() * 3); // only initial color index
    const initPlayerPositionY = 0.25; // bodyHeight / 2
    const initPlayerPosition = [Math.random() * 10 - 5, initPlayerPositionY, Math.random() * 10 - 5];
    clients[_id].colorIndex = colorIndex;
    clients[_id].position = initPlayerPosition;
    clients[_id].quaternion = [0, 0, 0, 1];
  }
  io.sockets.emit("restartRound", clients);
  shouldCountDown = false; // just in case the countdown was not properly stopped
}

function resetRound() {
  console.log("resetting round...");
  round.colorIndex = 3;
  round.totalNum = 10;
  round.currentNum = 1;
  round.prize = 1000;
  round.totalTime = 60;
  round.currentTime = 60;
  round.message = "";
  for (const _id in clients) {
    clients[_id].prize = 0;
  }
  updatePlayerList();
  restartRound();
}

function main() {
  setupSocketServer();

  setInterval(function () { // game loop
    const numClients = Object.keys(clients).length;
    if (numClients !== previousNumClients) { // client number changed
      updatePlayerList();
      if (numClients > 1) { // if other user joins, restart the game
        if (numClients > previousNumClients) {
          round.state = ROUND_STATE.otherUserJoined;
          round.message = ROUND_MESSAGE.otherUserJoined;
          console.log(round.message);
          io.sockets.emit("roundStateChanged", round);
          startTime = Date.now();
          shouldCountDown = false; // just in case the countdown was not properly stopped
        }
      }
      else if (numClients === 1) {
        if (round.state !== ROUND_STATE.waitingForOtherPlayers) {
          round.state = ROUND_STATE.waitingForOtherPlayers;
          round.message = ROUND_MESSAGE.waitingForOtherPlayers;
          console.log(round.message);
          io.sockets.emit("roundStateChanged", round);
          startTime = Date.now();
          shouldCountDown = false; // just in case the countdown was not properly stopped
        }
      }
      else { // no player exists
        if (round.state !== ROUND_STATE.noPlayerExists) {
          round.state = ROUND_STATE.noPlayerExists;
          round.message = ROUND_MESSAGE.noPlayerExists;
          console.log(round.message);
          shouldCountDown = false; // just in case the countdown was not properly stopped
        }
      }
      previousNumClients = numClients;
    }

    const elapsedTime = Date.now() - startTime;

    switch (round.state) {
      case ROUND_STATE.waitingForOtherPlayers:
        break;
      case ROUND_STATE.otherUserJoined:
        if (elapsedTime > 10000) {
          resetRound();
          round.state = ROUND_STATE.startingNewRound;
          round.message = ROUND_MESSAGE.startingNewRound;
          console.log(round.message);
          io.sockets.emit("roundStateChanged", round);
          startTime = Date.now();
        }
        break;
      case ROUND_STATE.startingNewRound:
        if (elapsedTime > 5000) {
          round.state = ROUND_STATE.groundColorChanges;
          round.message = ROUND_MESSAGE.groundColorChanges;
          console.log(round.message);
          io.sockets.emit("roundStateChanged", round);
          startTime = Date.now();
          previousWrappedTime = startTime;
        }
        break;
      case ROUND_STATE.groundColorChanges:
        if (elapsedTime > 5000) {
          round.state = ROUND_STATE.roundStarted;
          round.message = ROUND_MESSAGE.roundStarted();
          console.log(round.message);
          io.sockets.emit("roundStateChanged", round);
          startTime = Date.now();
        }
        else if (elapsedTime < 4000) { // change ground color rapidly
          const wrappedTime = elapsedTime % 250;
          if (wrappedTime < previousWrappedTime) { // called periodically
            let colorIndex = round.colorIndex;
            while (colorIndex === round.colorIndex) {
              colorIndex = Math.floor(Math.random() * 3);
            }
            round.colorIndex = colorIndex; // always different than previous color
            io.sockets.emit("updateGroundColor", round.colorIndex);
          }
          previousWrappedTime = wrappedTime;
        }
        break;
      case ROUND_STATE.roundStarted:
        if (elapsedTime > 3000) {
          round.state = ROUND_STATE.instruction1;
          round.message = ROUND_MESSAGE.instruction1;
          console.log(round.message);
          io.sockets.emit("roundStateChanged", round);
          startTime = Date.now();
        }
        if (!shouldCountDown) { // start count down
          shouldCountDown = true;
          round.currentTime = round.totalTime;
          countDownStartTime = Date.now();
          countDownPreviousWrappedTime = countDownStartTime;
        }
        break;
      case ROUND_STATE.instruction1:
        if (elapsedTime > 5000) {
          round.state = ROUND_STATE.instruction2;
          round.message = ROUND_MESSAGE.instruction2;
          console.log(round.message);
          io.sockets.emit("roundStateChanged", round);
          startTime = Date.now();
        }
        break;
      case ROUND_STATE.instruction2:
        if (elapsedTime > 5000) {
          round.state = ROUND_STATE.instruction3;
          round.message = ROUND_MESSAGE.instruction3;
          console.log(round.message);
          io.sockets.emit("roundStateChanged", round);
          startTime = Date.now();
        }
        break;
      case ROUND_STATE.instruction3:
        if (elapsedTime > 5000) {
          round.state = ROUND_STATE.silence;
          round.message = ROUND_MESSAGE.silence;
          console.log(round.message);
          io.sockets.emit("roundStateChanged", round);
          startTime = Date.now();
        }
        break;
      case ROUND_STATE.silence:
        break;
      case ROUND_STATE.roundFinished:
        if (elapsedTime > 3000) {
          round.state = ROUND_STATE.announcingWinners;
          round.message = ROUND_MESSAGE.announcingWinners();
          console.log(round.message);
          io.sockets.emit("roundStateChanged", round);
          startTime = Date.now();
        }
        if (shouldCountDown) { // stop count down
          // store winners and distribute prize
          winners = "";
          let winnerIds = [];
          for (const _id in clients) {
            if (clients[_id].colorIndex === round.colorIndex) {
              winnerIds.push(_id);
            }
          }
          const numWinners = winnerIds.length;
          let prizePerWinner = Math.floor(round.prize / numWinners);
          if (numWinners === numClients) { // if everybody won, double the prize per winner
            prizePerWinner *= 2;
            winners = "Everyone! (2x bonus)";
            for (const _id of winnerIds) {
              clients[_id].prize += prizePerWinner;
            }
          }
          else {
            for (const _id of winnerIds) {
              winners += `${clients[_id].name}, `;
              clients[_id].prize += prizePerWinner;
            }
            if (winners) {
              winners = winners.slice(0, -2);
            }
          }
          updatePlayerList();
          shouldCountDown = false;
        }
        break;
      case ROUND_STATE.announcingWinners:
        if (elapsedTime > 5000) {
          if (round.currentNum === round.totalNum) { // if it was last round, announce final winner
            winners = "";
            let winnerNames = [];
            let previousPrize = 0;
            for (const player of playerList) {
              if (player.prize && player.prize === previousPrize) {
                winnerNames.push(player.name);
                previousPrize = player.prize;
              }
              else {
                break;
              }
            }
            if (winnerNames.length === playerList.length) {
              winners = "Everyone!";
            }
            else {
              for (const name of winnerNames) {
                winners += `${name}, `;
              }
              if (winners) {
                winners = winners.slice(0, -2);
              }
            }
            round.state = ROUND_STATE.announcingFinalWinner;
            round.message = ROUND_MESSAGE.announcingFinalWinner();
            console.log(round.message);
            io.sockets.emit("roundStateChanged", round);
            startTime = Date.now();
          }
          else { // restarting new round
            round.currentNum++;
            round.prize += 1000;
            round.currentTime = round.totalTime;
            restartRound();
            round.state = ROUND_STATE.startingNewRound;
            round.message = ROUND_MESSAGE.startingNewRound;
            console.log(round.message);
            io.sockets.emit("roundStateChanged", round);
            startTime = Date.now();
          }
        }
        break;
      case ROUND_STATE.announcingFinalWinner:
        if (elapsedTime > 5000) {
          resetRound(); // reset round
          round.state = ROUND_STATE.startingNewRound;
          round.message = ROUND_MESSAGE.startingNewRound;
          console.log(round.message);
          io.sockets.emit("roundStateChanged", round);
          startTime = Date.now();
        }
        break;
    }

    if (shouldCountDown) {
      const countDownElapsedTime = Date.now() - countDownStartTime;
      const countDownWrappedTime = countDownElapsedTime % 1000;
      if (countDownWrappedTime < countDownPreviousWrappedTime) { // called periodically
        if (round.currentTime === 0) {
          io.sockets.emit("updateCurrentTime", round.currentTime);
          round.state = ROUND_STATE.roundFinished;
          round.message = ROUND_MESSAGE.roundFinished();
          console.log(round.message);
          io.sockets.emit("roundStateChanged", round);
          startTime = Date.now();
        }
        else {
          io.sockets.emit("updateCurrentTime", round.currentTime);
          round.currentTime--;
        }
      }
      countDownPreviousWrappedTime = countDownWrappedTime;
    }

    // update all clients
    io.sockets.emit("updateClientProps", clients);
  }, 100);
}

function setupSocketServer() {
  // socket setup
  io.on("connection", client => {
    console.log("User " + client.id + " connected, there are " + io.engine.clientsCount + " clients connected");

    // add a new client indexed by his id
    clients[client.id] = {
      colorIndex: 3,
      position: [0, 0.25, 0],
      quaternion: [0, 0, 0, 1],
      name: "",
      prize: 0
    }

    // SENDERS (client.emit(): sending to sender-client only, io.sockets.emit(): send to all connected clients)

    // make sure to send clients, his ID, and a list of all keys
    client.emit("introduction", clients, client.id, Object.keys(clients), iceServers);

    // update everyone that the number of users has changed
    io.sockets.emit("newUserConnected", clients[client.id], io.engine.clientsCount, client.id);

    // update player properties
    io.sockets.emit("updateClientProps", clients);

    // RECEIVERS
    client.on("colorIndex", (data) => {
      if (clients[client.id]) {
        clients[client.id].colorIndex = data;
      }
    });

    client.on("move", (data) => {
      if (clients[client.id]) {
        clients[client.id].position = data[0];
        clients[client.id].quaternion = data[1];
      }
    });

    client.on("name", (data) => {
      if (clients[client.id]) {
        clients[client.id].name = data;
      }
      updatePlayerList();
    });

    // handle the disconnection
    client.on("disconnect", () => {
      delete clients[client.id];
      io.sockets.emit("userDisconnected", client.id);
      console.log("User " + client.id + " diconnected, there are " + io.engine.clientsCount + " clients connected");

      if (io.engine.clientsCount == 0) {
        // should end the game
      }
    });

    // WebRTC Communications
    client.on("call-user", (data) => {
      console.log(
        "Server forwarding call from " + client.id + " to " + data.to
      );
      client.to(data.to).emit("call-made", {
        offer: data.offer,
        socket: client.id,
      });
    });

    client.on("make-answer", (data) => {
      client.to(data.to).emit("answer-made", {
        socket: client.id,
        answer: data.answer,
      });
    });

    // ICE Setup
    client.on("addIceCandidate", (data) => {
      client.to(data.to).emit("iceCandidateFound", {
        socket: client.id,
        candidate: data.candidate,
      });
    });
  });
}

main(); // call main