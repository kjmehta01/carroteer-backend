const app = require('express')();
const http = require('http').Server(app);
const jsonParser = require('body-parser').json();
const port = 3000;

const cors = require('cors');
app.use(cors({
    origin: '*'
}))


let dailyLeaderboard = [];

/*function resetLeaderboard(){
    dailyLeaderboard = [];

}
var now = new Date();
var millisTill10 = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 10, 0, 0, 0) - now;
if (millisTill10 < 0) {
     millisTill10 += 86400000; // it's after 10am, try 10am tomorrow.
}
setTimeout(resetLeaderboard, millisTill10);

var dayInMilliseconds = 1000 * 60 * 60 * 24;
setInterval(function() { alert("foo"); },dayInMilliseconds );*/

app.get('/getScores', function (req, res) {
    res.send(dailyLeaderboard);
});

app.post('/addScore', jsonParser, function (req, res) {
    if (req.body.name != undefined && req.body.time != undefined) {
        let added = false;
        for (let i = 0; i < Math.min(dailyLeaderboard.length, 5); i++) {
            if (dailyLeaderboard[i].time > req.body.time) {
                dailyLeaderboard.splice(i, 0, { name: req.body.name, time: req.body.time });
                added = true;
                console.log("added time, " + req.body.name + " : " + req.body.time);
                if (dailyLeaderboard.length > 5) {
                    dailyLeaderboard.pop();
                }
                break;
            }
        }
        if (added == false && dailyLeaderboard.length < 5) {
            dailyLeaderboard.push({ name: req.body.name, time: req.body.time });
        }
    }
    res.send(dailyLeaderboard);
});

http.listen(process.env.PORT || 5000, function () {
    console.log('listening on *:5000');
});