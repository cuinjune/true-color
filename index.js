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

const ROUND_STATE = {
  noPlayerExists: 0,
  waitingForOtherPlayers: 1,
  otherUserJoined: 2,
  startingInstructions: 3,
  instruction1: 4,
  instruction2: 5,
  instruction3: 6,
  instruction4: 7,
  instruction5: 8,
  startingNewRound: 9,
  groundColorChanges: 10,
  roundStarted: 11,
  silence: 12,
  roundFinished: 13,
  announcingWinners: 14,
  announcingFinalWinner: 15
};

let round = {
  colorIndex: 3,
  totalNum: 5, // fixed
  currentNum: 1,
  prize: 1000,
  totalTime: 10,
  currentTime: 10,
  winners: "",
  message: "",
  state: ROUND_STATE.noPlayerExists
};

const ROUND_MESSAGE = {
  noPlayerExists: "",
  waitingForOtherPlayers: "Waiting for other players to join...",
  otherUserJoined: "A new player just joined, the game will start soon...",
  startingInstructions: "Now we have all the players in the room, here's how this game works.",
  instruction1: "The objective of the game is to match your body color to the ground color at the end of each round.",
  instruction2: "Each player can't see one's own body color but only the other players'. So the players need to talk to each other.",
  instruction3: "You can change your body color by clicking your left mouse button.",
  instruction4: "After each round, prize money will be distributed to the winners.",
  instruction5: "Now the game will start, have fun!",
  startingNewRound: "Starting a new round...",
  groundColorChanges: "Setting the ground color...",
  roundStarted: () => { return `Round ${round.currentNum} of ${round.totalNum} started!` },
  silence: "",
  roundFinished: () => { return `Round ${round.currentNum} of ${round.totalNum} finished!` },
  announcingWinners: () => { return round.winners ? `Announcing the winners: ${round.winners}` : "No winner was found in this round." },
  announcingFinalWinner: () => { return round.winners ? `Announcing the final winner: ${round.winners}` : "No final winner was found." }
};

let previousNumClients = 0;
let startTime = 0;
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

function resetRound(numClients) {
  console.log("resetting round...");
  round.colorIndex = 3;
  round.totalNum = 5;
  round.currentNum = 1;
  round.prize = 1000 * numClients;
  round.totalTime = 10 * numClients;
  round.currentTime = round.totalTime;
  round.message = "";
  for (const _id in clients) {
    clients[_id].prize = 0;
  }
  updatePlayerList();
  io.sockets.emit("updateGroundColor", [round.colorIndex]);
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

    // tracking elapsedTime after startTime was set
    const elapsedTime = Date.now() - startTime;

    switch (round.state) {
      case ROUND_STATE.waitingForOtherPlayers:
        break;
      case ROUND_STATE.otherUserJoined:
        if (elapsedTime >= 10000) {
          round.state = ROUND_STATE.startingInstructions;
          round.message = ROUND_MESSAGE.startingInstructions;
          console.log(round.message);
          io.sockets.emit("roundStateChanged", round);
          startTime = Date.now();
        }
        break;
      case ROUND_STATE.startingInstructions:
        if (elapsedTime >= 5000) {
          round.state = ROUND_STATE.instruction1;
          round.message = ROUND_MESSAGE.instruction1;
          console.log(round.message);
          io.sockets.emit("roundStateChanged", round);
          startTime = Date.now();
        }
        break;
      case ROUND_STATE.instruction1:
        if (elapsedTime >= 6000) {
          round.state = ROUND_STATE.instruction2;
          round.message = ROUND_MESSAGE.instruction2;
          console.log(round.message);
          io.sockets.emit("roundStateChanged", round);
          startTime = Date.now();
        }
        break;
      case ROUND_STATE.instruction2:
        if (elapsedTime >= 7000) {
          round.state = ROUND_STATE.instruction3;
          round.message = ROUND_MESSAGE.instruction3;
          console.log(round.message);
          io.sockets.emit("roundStateChanged", round);
          startTime = Date.now();
        }
        break;
      case ROUND_STATE.instruction3:
        if (elapsedTime >= 5000) {
          round.state = ROUND_STATE.instruction4;
          round.message = ROUND_MESSAGE.instruction4;
          console.log(round.message);
          io.sockets.emit("roundStateChanged", round);
          startTime = Date.now();
        }
        break;
      case ROUND_STATE.instruction4:
        if (elapsedTime >= 5000) {
          round.state = ROUND_STATE.instruction5;
          round.message = ROUND_MESSAGE.instruction5;
          console.log(round.message);
          io.sockets.emit("roundStateChanged", round);
          startTime = Date.now();
        }
        break;
      case ROUND_STATE.instruction5:
        if (elapsedTime >= 5000) {
          resetRound(numClients);
          round.state = ROUND_STATE.startingNewRound;
          round.message = ROUND_MESSAGE.startingNewRound;
          console.log(round.message);
          io.sockets.emit("roundStateChanged", round);
          startTime = Date.now();
        }
        break;
      case ROUND_STATE.startingNewRound:
        if (elapsedTime >= 3000) {
          round.state = ROUND_STATE.groundColorChanges;
          round.message = ROUND_MESSAGE.groundColorChanges;
          console.log(round.message);
          io.sockets.emit("roundStateChanged", round);
          startTime = Date.now();

          // generate color indices and send to client (for animation)
          const colorIndices = [];
          for (let i = 0; i < 16; i++) {
            let colorIndex = round.colorIndex;
            while (colorIndex === round.colorIndex) {
              colorIndex = Math.floor(Math.random() * 3);
            }
            round.colorIndex = colorIndex; // always different than previous color
            colorIndices.push(round.colorIndex);
          }
          io.sockets.emit("updateGroundColor", colorIndices);
        }
        break;
      case ROUND_STATE.groundColorChanges:
        if (elapsedTime >= 5000) {
          round.state = ROUND_STATE.roundStarted;
          round.message = ROUND_MESSAGE.roundStarted();
          console.log(round.message);
          io.sockets.emit("roundStateChanged", round);
          startTime = Date.now();
        }
        break;
      case ROUND_STATE.roundStarted:
        if (elapsedTime >= 3000) {
          round.state = ROUND_STATE.silence;
          round.message = ROUND_MESSAGE.silence;
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
      case ROUND_STATE.silence:
        break;
      case ROUND_STATE.roundFinished:
        if (elapsedTime >= 3000) {
          updatePlayerList();
          round.state = ROUND_STATE.announcingWinners;
          round.message = ROUND_MESSAGE.announcingWinners();
          console.log(round.message);
          io.sockets.emit("roundStateChanged", round);
          startTime = Date.now();
        }
        if (shouldCountDown) { // stop count down
          // store winners and distribute prize
          round.winners = "";
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
            round.winners = "Everyone! (2x bonus)";
            for (const _id of winnerIds) {
              clients[_id].prize += prizePerWinner;
            }
          }
          else {
            for (const _id of winnerIds) {
              round.winners += `${clients[_id].name}, `;
              clients[_id].prize += prizePerWinner;
            }
            if (round.winners) {
              round.winners = round.winners.slice(0, -2);
            }
          }
          shouldCountDown = false;
        }
        break;
      case ROUND_STATE.announcingWinners:
        if (elapsedTime >= 5000) {
          if (round.currentNum === round.totalNum) { // if it was last round, announce final winner
            round.winners = "";
            let winnerNames = [];
            let previousPrize = 0;
            for (const player of playerList) {
              if (player.prize && (!previousPrize || player.prize === previousPrize)) {
                winnerNames.push(player.name);
                previousPrize = player.prize;
              }
              else {
                break;
              }
            }
            if (winnerNames.length === playerList.length) {
              round.winners = "Everyone!";
            }
            else {
              for (const name of winnerNames) {
                round.winners += `${name}, `;
              }
              if (round.winners) {
                round.winners = round.winners.slice(0, -2);
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
        if (elapsedTime >= 5000) {
          resetRound(numClients); // reset round
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