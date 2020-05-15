// Takes on a firebase object and handles all the connection and state stuff for you :)
export default class GameConnector {

    constructor(firebase) {
        this.firestore = firebase.firestore();
        this.usersDb = this.firestore.collection("users");
        this.gamesDb = this.firestore.collection("games");
        this.authenticate();
    }

    authenticate() {
        const auth = firebase.auth();
        auth.signInAnonymously();
        auth.onAuthStateChanged(oAuthUser => {
            this.setStatus("authentification");

            if (!oAuthUser) {
                this.setStatus("auth_failed");
                return;
            }

            this.setStatus("auth_successfull");

            this.addUserToDb(oAuthUser.uid).then(oUser => {
                this.findGame(oUser).then(oGame => {
                    this.gameId = oGame.id;
                    this.setStatus("found_game");
                    this.playGame(oGame, oUser);
                });
            });
        });
    }

    playGame(oGame, oUser) {
        this.player = oGame.data().players.indexOf(oUser.id);

        this.gamesDb.doc(this.gameId).onSnapshot(oGameDoc => {
            // Game went missing?
            if (!oGameDoc.exists) {
                findRunningGame(oUser);
                return false;
            }

            this.onUpdate(oGameDoc.data());
        });
    }

    updateGame(oUpdateData) {
        this.gamesDb.doc(this.gameId).set(oUpdateData, {merge: true});
    }

    setStatus(sStatus) {
        const aStates = {
            "authentification": "Authentification",
            "auth_failed":      "Authentification failed",
            "auth_successfull": "Authentification successfull",
            "new_user":         "Added new user",
            "existing_user":    "Existing user detected",
            "looking":          "Looking for a game to join",
            "found_running":    "Found running game",
            "start_new_game":   "Starting new game",
            "found_game":       "Found a game. Joining now",
            "joining_game":     "Joining open game",
            "continue_game":    "Continuing previous game",
            "waiting":          "Waiting for an opponent to join",
        };

        document.getElementById("status").innerHTML = aStates[sStatus];
        console.log(aStates[sStatus]);
    }

    addUserToDb(sAuthId) {
        return new Promise(resolve => {
            const oUserRef = this.usersDb.doc(sAuthId);
            oUserRef.get().then(oUser => {
                // User exists? Start looking for games
                if (oUser.exists) {
                    this.setStatus("existing_user");
                    return resolve(oUser);
                }

                // Init new user
                oUserRef.set({
                    score: 0
                }).then(() => {
                    oUserRef.get().then(oUser => {
                        this.setStatus("new_user");
                        return resolve(oUser);
                    });
                });
            });
        });
    }

    findGame(oUser) {
        return new Promise(resolve => {
            // Look for game with open slot
            this.gamesDb.where("open", "==", 1).get().then(async oGameQuery => {
                // No open slot? Start new game
                if (oGameQuery.empty) {
                    let oGame = await this.findRunningGame(oUser);
                    if (!oGame) oGame = await this.startNewGame(oUser);
                    return resolve(oGame);
                }

                // Check if there's a game the user already joined
                const oExistingGame = oGameQuery.docs.find(oGame => {
                    return oGame.data().players.includes(oUser.id);
                });
                if (typeof oExistingGame != "undefined") {
                    this.setStatus("continue_game");
                    return resolve(oExistingGame);
                }

                // Open game found! Join in
                const oGame = oGameQuery.docs[0];
                await this.joinOpenGame(oGame, oUser);
                return resolve(oGame);
            });
        });
    }

    // Starts new game and assigns the user
    async startNewGame(oUser) {
        this.setStatus("start_new_game");
        return await this.gamesDb.add({
            players: [oUser.id],
            open: 1,
            choices: []
        }).then(oGameDoc => {
            return oGameDoc;
        });
    }

    // Finds game the user is assigned to and which already has an opponent
    async findRunningGame(oUser) {
        this.setStatus("looking");
        return await this.gamesDb
            .where("players", "array-contains", oUser.id)
            .get().then(oGamesQuery => {

            if (oGamesQuery.empty) {
                console.log("no running game found");
                return;
            }

            const oGame = oGamesQuery.docs[0];
            if (oGame.data().open == 1) {
                console.log("running game has no opponent");
                return;
            }

            this.setStatus("found_running");
            return oGame;
        });
    }

    // Adds user to given game
    async joinOpenGame(oGame, oUser) {
        this.setStatus("joining_game");
        await this.gamesDb.doc(oGame.id).set({
            players: oGame.data().players.concat([oUser.id]),
            open: 0
        }, {merge: true});
    }

    // Returns current timestamp used for firebase documents
    now() {
        return firebase.firestore.FieldValue.serverTimestamp();
    }
}