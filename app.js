// express
const app = require('express')();
const http = require('http').Server(app);
const jsonParser = require('body-parser').json();
const port = 3000;

// cors
const cors = require('cors');
app.use(cors({
    origin: '*'
}))

// postgres
const { Client } = require('pg');

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



function resetLeaderboard(){
    client.query('TRUNCATE TABLE dailyHighscores', (err, res2) => {
        if(err){
            throw err;
        }
    });
    let dayInMilliseconds = 1000 * 60 * 60 * 24;
    setTimeout(resetLeaderboard,dayInMilliseconds);
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
        ret.sort((a,b) => a.time - b.time);
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
                if(isHighscore && dailyLeaderboard.length == 5){
                    client.query("DELETE FROM dailyHighscores WHERE time = " + maxTime + ";", (err, res3) => {
                        if(err){
                            res.sendStatus(500);
                            throw err;
                        }
                    });
                }

                // add new score
                if (isHighscore || dailyLeaderboard.length < 5) {
                    client.query("INSERT INTO dailyHighscores (name, time) VALUES('" + req.body.name + "'," + req.body.time + ");", (err, res4) => {
                        if(err){
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
        if(err){
            res.sendStatus(500);
            throw err;
        }
        else{
            res.sendStatus(200);
        }
    });
});

http.listen(process.env.PORT || 5000, function () {
    console.log('listening on *:5000');
});