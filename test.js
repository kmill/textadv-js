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

parser.action.understand("say [text x]", parse => making_mistake("You said: " + parse.x));

def_obj("strange smell", "backdrop", {
  backdrop_locations: "everywhere",
  description: "A strange smell that you can't place. It seems to linger wherever you go."
});

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
There is a restroom to the [dir west], to the [dir north] is the ball pit, and to the [dir east] is Container Alley.`
});
make_known("Lobby Restroom");
make_known("Ball Pit");
make_known("Container Alley");
world.connect_rooms("Lobby", "west", "Lobby Restroom", {via: "restroom door"});
world.connect_rooms("Lobby", "north", "Ball Pit");
world.connect_rooms("Lobby", "east", "Container Alley");

def_obj("sign", "thing", {
  description: `It says "0 days since last accident." Sounds about right.`,
  is_scenery: true,
  reported: true
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

/*** The lobby restroom **/

def_obj("Lobby Restroom", "room", {
  added_words: ["bathroom"],
  description: function () {
    out.write(`It's a standard institutional single-occupancy restroom,
just to the west of the main lobby.`);
    if (world.is_switched_on("sink")) {
      out.write(" You hear the sound of running water.");
    }
  }
});
def_obj("restroom door", "door", {
  added_words: ["bathroom"],
  is_scenery: true,
  description: "A black door with a sign indicating it's for a single-occupancy restroom."
});

def_obj("toilet", "thing", {
  description: "A porcelain toilet, ready for use."
}, {put_in: "Lobby Restroom"});

world.global.set("dirty hands", false);

actions.before.add_method({
  when: action => action.verb === "using" && action.dobj === "toilet",
  handle: action => {
    if (world.is_open("restroom door")) {
      throw new abort_action("The restroom door is open. Better be more discreet.");
    }
  }
});
actions.carry_out.add_method({
  when: action => action.verb === "using" && action.dobj === "toilet",
  handle: function (action) {
    world.global.set("dirty hands", true);
  }
});
actions.report.add_method({
  when: action => action.verb === "using" && action.dobj === "toilet",
  handle: function (action) {
    out.write("{Bobs} {relieve} {ourself}.");
  }
});

actions.before.add_method({
  when: action => (action.verb === "going" && world.location(world.actor) === "Lobby Restroom"
                   && world.global("dirty hands")),
  handle: function (action) {
    throw new abort_action("You can't leave with dirty hands.");
  }
});

actions.before.add_method({
  when: action => (action.verb === "going" && world.location(world.actor) === "Lobby Restroom"
                   && world.is_switched_on("sink")),
  handle: function (action) {
    throw new abort_action("The sink is still running!");
  }
});

def_obj("sink", "thing", {
  added_words: ["@faucet"],
  switchable: true,
  description: "A sink with a faucet."
}, {put_in: "Lobby Restroom"});

parser.action.understand("wash hands", (parse) => {
  if (world.containing_room(world.actor) === "Lobby Restroom") {
    return using("sink");
  } else {
    return void 0;
  }
});
parser.action.understand("wash hands in [obj sink]", (parse) => {
  if (world.containing_room(world.actor) === "Lobby Restroom") {
    return using("sink");
  } else {
    return void 0;
  }
});
parser.action.understand("wash hands in [obj toilet]", (parse) => {
  if (world.containing_room(world.actor) === "Lobby Restroom") {
    return making_mistake("Disgusting.");
  } else {
    return void 0;
  }
});

actions.before.add_method({
  when: action => action.verb === "using" && action.dobj === "sink",
  handle: function (action) {
    if (!world.is_switched_on("sink")) {
      throw new abort_action("The sink needs to be turned on.");
    }
  }
});
actions.carry_out.add_method({
  when: action => action.verb === "using" && action.dobj === "sink",
  handle: function (action) {
    world.global.set("dirty hands", false);
  }
});
actions.report.add_method({
  when: action => action.verb === "using" && action.dobj === "sink",
  handle: function (action) {
    out.write("{Bobs} {wash} {our} hands thoroughly.");
  }
});

/*** The ball pit ***/

def_obj("Ball Pit", "room", {
  description: "The name of the room is the ball pit, but it's more a room with more than a few balls. You can go [dir south] back to the lobby."
});

def_obj("ball1", "thing", {
  name: "big red ball"
}, {put_in: "Ball Pit"});

def_obj("ball2", "thing", {
  name: "small red ball"
}, {put_in: "Ball Pit"});

def_obj("ball3", "thing", {
  name: "big blue ball"
}, {put_in: "Ball Pit"});

def_obj("ball4", "thing", {
  name: "small blue ball"
}, {put_in: "Ball Pit"});

def_obj("ball5", "thing", {
  name: "big green ball"
}, {put_in: "Ball Pit"});

def_obj("ball6", "thing", {
  name: "small green ball"
}, {put_in: "Ball Pit"});

def_obj("ball7", "thing", {
  name: "big yellow ball"
}, {put_in: "Ball Pit"});

def_obj("ball8", "thing", {
  name: "small yellow ball"
}, {put_in: "Ball Pit"});

/*** Container Alley ***/

def_obj("Container Alley", "room", {
  description: "In addition to containers, there are also some supporters here.  The lobby is back to the [dir west]."
});

def_obj("cardboard box", "container", {
  description: "It's a cardboard box, big enough to hide in and close.",
  enterable: true,
  openable: true,
  is_open: true,
  locale_description: "You think cozy thoughts as you hide in this cozy cardboard box."
}, {put_in: "Container Alley"});

def_obj("plastic box", "container", {
  description: "It's a box made of translucent plastic sheets, big enough to hide in and close.",
  added_words: ["translucent"],
  enterable: true,
  openable: true,
  is_opaque: false
}, {put_in: "Container Alley"});

def_obj("cubby", "container", {
  description: "A box that can't be closed.  It's big enough to enter.",
  enterable: true,
}, {put_in: "Container Alley"});

def_obj("small box", "container", {
  description: "A small open box made of pine."
}, {put_in: "Container Alley"});

def_obj("wooden table", "supporter", {
  description: "It's just a table, made of wood.",
  fixed_in_place: true,
  no_take_msg: "The table is too large to comfortably carry, so you won't try.",
  enterable: true
}, {put_in: "Container Alley"});

def_obj("cheap table", "supporter", {
  description: "It's a cheap plastic table",
  no_enter_msg: "It'll break if you try to get on it."
}, {put_in: "Container Alley"});


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
