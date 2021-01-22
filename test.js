window.addEventListener("load", () => {
  init_output("output");

  out.write_text("Welcome! ");
  out.wrap_action_link("do foo", () => {
    out.write_text("click to foo");
  });
  out.write_text(" that was a link");
  out.para();
  out.write_text("This is a new paragraph. ");
  out.The("ball"); out.write_text(" is "); out.a("ball"); out.write_text(".");
  out.para();
  out.look("north");
  out.write_text(" ");
  out.serial_comma(["plain door", "ball", "ball2"]);
  out.para();
  out.write("[The ball] is [a ball].[para]You can look [look north] towards the horizon.");
  out.write("[para]{Bobs} {look} upon the vista and {contemplate} {our} future.");
  out.para();
  world.describe_object("locket");
  out.para();
  world.describe_current_location();
});

def_obj("main room", "room", {
  name: "Main Room",
  description: `This is a room, like many others, but what sets it apart is how it is the first one that comes to mind
when you think of a "room."  Hence it's the main one.`
});

def_obj("other room", "room", {
  name: "Other Room"
});

def_obj("plain door", "door", {
});
world.connect_rooms("main room", "east", "plain door");
world.connect_rooms("plain door", "east", "other room");

def_obj("ball", "thing", {
  name: "big red ball"
}, {
  put_in: "main room"
});

def_obj("ball2", "thing", {
  name: "green ball"
}, {
  put_in: "other room"
});

def_obj("player", "person", {
  proper_named: false
}, {
  put_in: "main room"
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
  is_open: true,
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
