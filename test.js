world.global.set("game title", "A visit to TestWorld");
world.global.set("game author", "Kyle Miller");
world.global.set("game description", `You just pulled up to the laboratory
and made your way into the lobby.  Hopefully all the experiments are still
running smoothly...`);

window.addEventListener("load", () => {
  init_output("output");
  start_game_loop();
  return;
});

def_obj("player", "person", {
  proper_named: false,
  words: ["@player", "@yourself", "@self", "@me"],
  description: "You're figuring stuff out."
});
world.put_in("player", "Lobby");

def_obj("photo ID", "thing", {
  added_words: ["@identification"],
  description: `It's your photo ID, which gives you access to TestWorld.  When you rock it
back and forth the holographic portrait gives you slightly different perspectives of your head.`
}, {give_to: "player"});


def_obj("Lobby", "room", {
  name: "TestWorld Lobby",
  description: `You're in the lobby area for TestWorld, a laboratory for
the [enter_inline code]textadv-js[leave] interactive fiction engine.  So long as
you have your photo id, you have free access to the entire premises.
There is a restroom to the [dir west].

[para]To the [dir north] is the ball pit.

[para]You see [a sign] on the wall.`
});
make_known("Lobby Restroom");
make_known("Ball Pit");

def_obj("sign", "thing", {
  description: `It says "0 days since last accident." Sounds about right.`,
  is_scenery: true
}, {put_in: "Lobby"});

def_obj("chair", "supporter", {
  name: "leather armchair",
  added_words: ["leather", "@chair"],
  enterable: true,
  fixed_in_place: true,
  no_take_msg: "That's glued to the floor.",
  description: "This leather armchair has seen some use."
}, {put_in: "Lobby"});
def_obj("loose change", "thing", {
  uncountable: true,
  added_words: ["@dime", "@nickel"],
  description: "Dimes, nickels, and quarters, but strangely no pennies."
}, {put_in: "chair"});

def_obj("booster chair", "supporter", {
  description: "It's a chair to put on chairs.",
  enterable: true
}, {put_in: "chair"});

def_obj("cardboard box", "container", {
  description: "It's a cardboard box, big enough to hide in.",
  enterable: true,
  openable: true,
  is_open: true
}, {put_in: "chair"});


def_obj("Lobby Restroom", "room", {
  added_words: ["bathroom"],
  description: `It's a standard institutional single-occupancy restroom,
just to the west of the main lobby.`
});
def_obj("restroom door", "door", {
  added_words: ["bathroom"],
  is_scenery: true,
  description: "A black door with a sign indicating it's for a single-occupancy restroom."
});
world.connect_rooms("Lobby", "west", "Lobby Restroom", {via: "restroom door"});

def_obj("Ball Pit", "room", {
});
world.connect_rooms("Lobby", "north", "Ball Pit");

/*
def_obj("plain door", "door", {
});
world.connect_rooms("main room", "east", "plain door");
world.connect_rooms("plain door", "east", "other room");

def_obj("ball", "thing", {
  name: "big red ball"
}, {
  put_in: "main room"
});

def_obj("ball3", "thing", {
  name: "small yellow ball"
}, {
  put_in: "main room"
});

def_obj("ball2", "thing", {
  name: "green ball"
}, {
  put_in: "other room"
});

def_obj("coin", "thing", {
}, {
  give_to: "player"
});
def_obj("trinket", "thing", {
  name: "useless trinket",
  indefinite_name: "a useless trinket"
}, {
  give_to: "player"
});
def_obj("locket", "container", {
  name: "golden locket",
  openable: true,
//  is_open: true,
  description: "This is your precious golden locket that you carry wherever you go."
}, {
  //  give_to: "player"
  put_in: "main room"
});
def_obj("hair", "thing", {
  name: "lock of hair"
}, { put_in: "locket" });

def_obj("Colleen", "person", {
  gender: "female"
}, {
  put_in: "main room"
});
//world.actor = "Colleen";
*/
