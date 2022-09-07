// express
const app = require('express')();
const http = require('http').Server(app);
const jsonParser = require('body-parser').json();
const port = 3000;
const io = require('socket.io')(http, {
    cors: {
        origin: '*',
    }
});

// cors
const cors = require('cors');
app.use(cors({
    origin: '*'
}))

// postgres
const { Client } = require('pg');
const { isObject } = require('util');

const client = new Client({
    connectionString: 'postgres://bbgwntcjtmijyn:379c838039baf2acedbb0e6b5fba63b13a209b7b65b5957292e244f43d7e8c5e@ec2-54-86-106-48.compute-1.amazonaws.com:5432/d51k32h4ustu3h',
    ssl: {
        rejectUnauthorized: false
    }
});


client.connect();
client.query('CREATE TABLE IF NOT EXISTS dailyHighscores(name VARCHAR (8) NOT NULL,time INT NOT NULL);', (err, res) => {
    if (err) {
        throw err;
    }
});



function resetLeaderboard() {
    client.query('TRUNCATE TABLE dailyHighscores', (err, res2) => {
        if (err) {
            throw err;
        }
    });
    let dayInMilliseconds = 1000 * 60 * 60 * 24;
    setTimeout(resetLeaderboard, dayInMilliseconds);
}

let now = new Date();
let millisTill10 = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 10, 0, 0, 0) - now;
if (millisTill10 < 0) {
    millisTill10 += 86400000; // it's after 10am, try 10am tomorrow.
}
setTimeout(resetLeaderboard, millisTill10);



app.get('/getScores', function (req, res) {
    client.query('SELECT name, time FROM dailyHighscores', (err, res2) => {
        if (err) throw err;
        let ret = res2.rows;
        ret.sort((a, b) => a.time - b.time);
        res.send(ret);
    });
});

app.post('/addScore', jsonParser, function (req, res) {
    client.query('SELECT name, time FROM dailyHighscores', (err, res2) => {
        if (err) {
            res.sendStatus(500);
            throw err;
        }
        else {
            let dailyLeaderboard = res2.rows;
            if (req.body.name != undefined && req.body.time != undefined) {
                let maxTime = -1;
                for (let i = 0; i < dailyLeaderboard.length; i++) {
                    maxTime = Math.max(dailyLeaderboard[i].time, maxTime);
                }

                let isHighscore = maxTime > req.body.time;

                // delete highest score if leaderboard full
                if (isHighscore && dailyLeaderboard.length == 5) {
                    client.query("DELETE FROM dailyHighscores WHERE time = " + maxTime + ";", (err, res3) => {
                        if (err) {
                            res.sendStatus(500);
                            throw err;
                        }
                    });
                }

                // add new score
                if (isHighscore || dailyLeaderboard.length < 5) {
                    client.query("INSERT INTO dailyHighscores (name, time) VALUES('" + req.body.name + "'," + req.body.time + ");", (err, res4) => {
                        if (err) {
                            res.sendStatus(500);
                            throw err;
                        }
                    });
                }
            }
        }
        res.sendStatus(200);
    });
});

app.post('/clearScores', function (req, res) {
    client.query('TRUNCATE TABLE dailyHighscores', (err, res2) => {
        if (err) {
            res.sendStatus(500);
            throw err;
        }
        else {
            res.sendStatus(200);
        }
    });
});



// MULTIPLAYER
const boardHeight = 8;
const boardWidth = 8;
const hopSpeed = 1000;
const numStones = 5;
const numCarrots = 10; // MUST BE EVEN
const bombTime = 2000;

const tickRate = 10;
const frequency = 1 / tickRate;
let needyGame = -1;
let games = new Map();
let intervals = new Map();
let gameId = 0;
io.on("connection", (socket) => {
    console.log('user connected');

    let myRoom;
    //let p1p2;
    if (needyGame != -1) {
        myRoom = 'room' + needyGame;
        console.log("STARTED" + myRoom);
        needyGame = -1;

        //p1p2 = 'p2';
        games.set(myRoom, initializeBoard(myRoom));

        socket.to(myRoom).emit('p1');

        socket.join(myRoom);


        setTimeout(((myRoom)=>{
            io.to(myRoom).emit('starting');
        }).bind(null, myRoom), 100);

        setTimeout(((myRoom)=>{
            let myInterval = setInterval(function () { gameLoop(myRoom) }, frequency * 1000);
            intervals.set(myRoom, myInterval);
        }).bind(null, myRoom), 500);

    }
    else {
        myRoom = 'room' + gameId;

        socket.join(myRoom);

        //p1p2 = 'p1';
        needyGame = gameId;

        gameId = (gameId + 1) % 10000;

        //io.to(myRoom).emit('p1');
    }

    function initializeBoard(myRoom) {

        // BOARD
        let board = [];
        for (let row = 0; row < boardHeight; row++) {
            let rowArr = [];
            for (let col = 0; col < boardWidth; col++) {
                rowArr.push('E');
            }
            board.push(rowArr);
        }


        board[0][0] = 'NE';
        board[boardHeight - 1][boardWidth - 1] = 'SW';


        // CARROTS
        let carrots = [];
        for (let row = 0; row < boardHeight; row++) {
            carrots[row] = [];
            for (let col = 0; col < boardWidth; col++) {
                carrots[row][col] = false;
            }
        }
        carrots[3][4] = true;
        carrots[4][3] = true;
        for (let i = 0; i < Math.floor(numCarrots / 2) - 2; i++) {
            do {
                var xtemp = Math.floor(Math.random() * boardWidth);
                var ytemp = Math.floor(Math.random() * boardHeight);

                var duplicate = false;

                if (xtemp == 0 && ytemp == 0) {
                    duplicate = true;
                }
                if (xtemp == boardWidth - 1 && ytemp == boardHeight - 1) {
                    duplicate = true;
                }
                if (carrots[ytemp][xtemp]) {
                    duplicate = true;
                }
            } while (duplicate);

            carrots[ytemp][xtemp] = true;
            carrots[boardHeight - 1 - ytemp][boardWidth - 1 - xtemp] = true;
        }




        // STONES
        let stones = [];
        for (let row = 0; row < boardHeight; row++) {
            stones[row] = [];
            for (let col = 0; col < boardWidth; col++) {
                stones[row][col] = false;
            }
        }
        for (let i = 0; i < Math.floor(numStones) / 2; i++) {
            do {
                var xtemp = Math.floor(Math.random() * boardWidth);
                var ytemp = Math.floor(Math.random() * boardHeight);

                var duplicate = false;

                if ((xtemp == 0 || xtemp == 1) && ytemp == 0) {
                    duplicate = true;
                }
                if ((xtemp == boardWidth - 1 || xtemp == boardWidth - 2) && ytemp == boardHeight - 1) {
                    duplicate = true;
                }
                if (carrots[ytemp][xtemp] || stones[ytemp][xtemp]) {
                    duplicate = true;
                }
            } while (duplicate);

            stones[ytemp][xtemp] = true;
            stones[boardHeight - 1 - ytemp][boardWidth - 1 - xtemp] = true;
        }


        // BOMBS
        let bombs = [];
        for (let row = 0; row < boardHeight; row++) {
            bombs[row] = [];
            for (let col = 0; col < boardWidth; col++) {
                bombs[row][col] = false;
            }
        }

        let bombTimers = [];
        for (let row = 0; row < boardHeight; row++) {
            bombTimers[row] = [];
            for (let col = 0; col < boardWidth; col++) {
                bombTimers[row][col] = undefined;
            }
        }


        // PLAYER
        let p1 = new Player(0, 0, 'E');
        let p2 = new Player(boardWidth - 1, boardHeight - 1, 'W');


        const game = {
            board: board,
            carrots: carrots,
            stones: stones,
            p1: p1,
            p2: p2,
            bombs: bombs,
            bombTimers: bombTimers
        }

        return game;
    }

    function gameLoop(myRoom) {
        let game = games.get(myRoom);

        if (game.p1.eatCarrot(game.carrots)) {
            game.carrots[game.p1.y][game.p1.x] = false;
        }
        if (game.p2.eatCarrot(game.carrots)) {
            game.carrots[game.p2.y][game.p2.x] = false;
        }

        io.to(myRoom).emit('board', game.board, game.carrots, game.stones, game.bombs, game.p1.x, game.p1.y, game.p1.dir, game.p1.carrotCount, game.p2.x, game.p2.y, game.p2.dir, game.p2.carrotCount);
    }

    socket.on('place piece', (y, x, dir) => {
        let game = games.get(myRoom);

        if (game != undefined && game.board[y][x] == 'E' && !game.stones[y][x]) {
            game.board[y][x] = dir;
            game.p1.updatePlayerCoords(game);
            game.p2.updatePlayerCoords(game);
            socket.emit('place piece success');
        }
        else {
            socket.emit('place piece fail');
        }
    });

    socket.on('place bomb', (y, x) => {
        let game = games.get(myRoom)

        if (game != undefined && !game.bombs[y][x] && !game.stones[y][x]) {
            game.bombs[y][x] = true;
            game.bombTimers[y][x] = setTimeout(() => {
                if (game.board[y][x] != 'E') {
                    game.board[y][x] = 'E';
                }
                game.bombTimers[y][x] = undefined;
                game.bombs[y][x] = false;

                if (game.p1.x == x && game.p1.y == y) {
                    game.p1.resetCoords(game);
                }
                if (game.p2.x == x && game.p2.y == y) {
                    game.p2.resetCoords(game);
                }
            }, bombTime);
        }
    });

    socket.on('disconnect', () => {
        console.log('user disconnected');
        if (games.has(myRoom)) {
            io.to(myRoom).emit('opp disconnect');
            console.log('ending ' + myRoom);
            clearInterval(intervals.get(myRoom));
            intervals.delete(myRoom);
        }
        else if (games.has(myRoom)) {
            games.delete(myRoom);
        }
        else {
            needyGame = -1;
        }
    });
});


http.listen(process.env.PORT || 5000, function () {
    console.log('listening on *:5000');
});















class Player {
    constructor(myx, myy, mydir) {
        this.startingX = myx;
        this.startingY = myy;
        this.startingDir = mydir;
        this.x = myx;
        this.y = myy;
        this.dir = mydir;
        this.carrotCount = 0;
        this.isWaiting = false;
    }

    resetCoords(game) {
        this.x = this.startingX;
        this.y = this.startingY;
        this.dir = this.startingDir;
        this.updatePlayerCoords(game);
    }

    eatCarrot(carrots) {
        if (carrots[this.y][this.x]) {
            this.carrotCount++;
            return true;
        }
    }

    updatePlayerCoords(game) {
        let board = game.board;

        if (!this.isWaiting) {
            this.isWaiting = true;

            setTimeout(() => {
                this.isWaiting = false;

                if (this.dir == 'E') {
                    if (this.x + 1 < boardWidth) {
                        if (board[this.y][this.x + 1] == 'NW') {
                            this.x += 1;
                            this.y += 0;
                            this.dir = 'N';
                            this.clearBomb(this.x, this.y, game);
                            this.updatePlayerCoords(game);
                        }
                        else if (board[this.y][this.x + 1] == "SW") {
                            this.x += 1;
                            this.y += 0;
                            this.dir = 'S';
                            this.clearBomb(this.x, this.y, game);
                            this.updatePlayerCoords(game);
                        }
                        else if (board[this.y][this.x + 1] == "WE") {
                            this.x += 1;
                            this.y += 0;
                            this.dir = 'E';
                            this.clearBomb(this.x, this.y, game);
                            this.updatePlayerCoords(game);
                        }
                    }
                }
                else if (this.dir == 'N') {
                    if (this.y - 1 >= 0) {
                        if (board[this.y - 1][this.x] == "SW") {
                            this.x += 0;
                            this.y += -1;
                            this.dir = 'W';
                            this.clearBomb(this.x, this.y, game);
                            this.updatePlayerCoords(game);
                        }
                        else if (board[this.y - 1][this.x] == "SE") {
                            this.x += 0;
                            this.y += -1;
                            this.dir = 'E';
                            this.clearBomb(this.x, this.y, game);
                            this.updatePlayerCoords(game);
                        }
                        else if (board[this.y - 1][this.x] == "NS") {
                            this.x += 0;
                            this.y += -1;
                            this.dir = 'N';
                            this.clearBomb(this.x, this.y, game);
                            this.updatePlayerCoords(game);
                        }
                    }
                }
                else if (this.dir == 'W') {
                    if (this.x - 1 >= 0) {
                        if (board[this.y][this.x - 1] == "NE") {
                            this.x += -1;
                            this.y += 0;
                            this.dir = 'N';
                            this.clearBomb(this.x, this.y, game);
                            this.updatePlayerCoords(game);
                        }
                        else if (board[this.y][this.x - 1] == "SE") {
                            this.x += -1;
                            this.y += 0;
                            this.dir = 'S';
                            this.clearBomb(this.x, this.y, game);
                            this.updatePlayerCoords(game);
                        }
                        else if (board[this.y][this.x - 1] == "WE") {
                            this.x += -1;
                            this.y += 0;
                            this.dir = 'W';
                            this.clearBomb(this.x, this.y, game);
                            this.updatePlayerCoords(game);
                        }
                    }
                }
                else if (this.dir == 'S') {
                    if (this.y + 1 < boardHeight) {
                        if (board[this.y + 1][this.x] == "NE") {
                            this.x += 0;
                            this.y += 1;
                            this.dir = 'E';
                            this.clearBomb(this.x, this.y, game);
                            this.updatePlayerCoords(game);
                        }
                        else if (board[this.y + 1][this.x] == "NW") {
                            this.x += 0;
                            this.y += 1;
                            this.dir = 'W';
                            this.clearBomb(this.x, this.y, game);
                            this.updatePlayerCoords(game);
                        }
                        else if (board[this.y + 1][this.x] == "NS") {
                            this.x += 0;
                            this.y += 1;
                            this.dir = 'S';
                            this.clearBomb(this.x, this.y, game);
                            this.updatePlayerCoords(game);
                        }
                    }
                }
            }, hopSpeed);
        }
    }

    clearBomb(x, y, game) {
        if (game.bombs[x][y]) {
            clearTimeout(game.bombTimers[x][y]);
            game.bombTimers[x][y] = undefined;
            game.bombs[x][y] = false;
        }
    }
}