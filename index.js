const express = require('express');
const app = express();
const pgp = require('pg-promise')();
const bodyParser = require('body-parser');
const session = require('express-session');
const bcrypt = require('bcrypt');
const axios = require('axios');

// database configuration
const dbConfig = {
    host: 'db',
    port: 5432,
    database: process.env.POSTGRES_DB,
    user: process.env.POSTGRES_USER,
    password: process.env.POSTGRES_PASSWORD,
};

const db = pgp(dbConfig);

// test your database
db.connect()
    .then(obj => {
        console.log('Database connection successful'); // you can view this message in the docker compose logs
        obj.done(); // success, release the connection;
    })
    .catch(error => {
        console.log('ERROR:', error.message || error);
    });

app.set('view engine', 'ejs');

app.use(bodyParser.json());

app.use(
    session({
        secret: process.env.SESSION_SECRET,
        saveUninitialized: false,
        resave: false,
    })
);

app.use(
    bodyParser.urlencoded({
        extended: true,
    })
);

const user = {
    username: undefined,
    password: undefined,
};

app.listen(3000);
console.log('Server is listening on port 3000');

app.get('/', (req, res) => {
    req.session.user = user;
    res.redirect('/login'); //this will call the /anotherRoute route in the API
});

app.get('/login', (req, res) => {
    res.render("pages/login");
});

app.post('/login', async (req, res) => {
    const query = "select * from users where username = $1";
    // get the username based on the password
    db.one(query, [
        req.body.username
    ])
        .then(async (data) => {
            const match = await bcrypt.compare(req.body.password, user.password);
            //const values = [match];
            if (match) {
                req.session.user = {
                    api_key: process.env.API_KEY,
                };
                req.session.save();
                res.redirect("/discover");
            } else {
                //throw new Error(`incorrect username or password`);
                //res.status(400).send("Incorrect username or password")               
                res.redirect("/register");
            }
        })
        .catch((err) => {
            console.log(err);
            res.redirect("/register");
        });
});

//Authentication Middleware.
const auth = (req, res, next) => {
    if (!req.session.user) {
        // Default to register page.
        //return res.redirect('/register');
    }
    next();
};

// Authentication Required
app.use(auth);

app.get('/register', (req, res) => {
    res.render('pages/register', {});
});

// Register submission
app.post('/register', async (req, res) => {
    const query = 'INSERT INTO users (username, password) VALUES ($1, $2)';
    const hash = await bcrypt.hash(req.body.password, 10);
    db.any(query, [
        req.body.username,
        hash,
    ])
        .then(function (data) {
            user.password = hash;
            user.username = req.body.username;
            res.redirect('/login');
        })
        .catch(function (err) {
            console.log(err);    
            res.redirect('/register')       ;
        });
    //the logic goes here
});

app.get('/discover', (req, res) => {
    axios({
        url: `https://app.ticketmaster.com/discovery/v2/events.json`,
        method: 'GET',
        dataType: 'json',
        params: {
            "apikey": req.session.user.api_key,
            "keyword": "Durk", //you can choose any artist/event here
            "size": 100,
        }
    })
        .then(results => {
            //console.log(results.data); // the results will be displayed on the terminal if the docker containers are running
            // Send some parameters
            res.render('pages/discover', { events: results.data._embedded.events });
        })
        .catch(error => {
            console.log(error);
            // Handle errors
            res.render('pages/discover', { render: [] });
        })
});

app.get("/logout", (req, res) => {
    req.session.destroy();
    res.redirect("/login");
});