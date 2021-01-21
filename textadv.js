// textadv.js
// A simple engine for interactive fiction.
// (c) 2021 Kyle Miller

/*** Generic functions ***/

/*
In the usual formulation of object-oriented programming, every object has a type called
its "class."  The classes form a hierarchy modeling the is-a relation, and each class
contains procedures called "methods."  Given an object, you can "call a method" to execute
one or more of these methods in the hierarchy, and which ones are executed is determined
by the class hierarchy.

In short: it is a scheme to organize bits of code that you want to run at different times.

It turns out that without some more work, this scheme does not solve the so-called
"expression problem," which has to do with making it so that a user of a library can
both add more types and add more methods without modifying the library itself.  Also, not
everything maps cleanly to the is-a relation.

A game library needs to be very easy to customize -- to be able to run your own bits of code
at the times you want them to.  A simple solution to this is "generic functions," which are
collections of functions that run under certain user-specified conditions.

This is a simple (and inefficient) implementation of generic functions that's perfectly fine
for interactive fiction.  The generic function has a list of methods, each of which has two
fields: `when` is a boolean function that determines whether or not the method should run,
and `handle` is the procedure associated to the method.  Inside the procedure, you can
use `this.next()` to continue calling the next method.

A more advanced system would sort the methods automatically based on applicability -- we leave
sorting to the user.  This is through using `add_method` in the correct order or by
using `add_method_before` and `add_method_after`.
*/

function make_generic_function(name, options) {
  options = options || {};
  function f(...args) {
    function mk$next(i) {
      return {
        i: i,
        next: function () {
          return next(this.i);
        }
      };
    }
    function next(i) {
      for (; i >= 0; i--) {
        var when = f.methods[i].when;
        if (!when || when.apply(null, args)) {
          return f.methods[i].handle.apply(mk$next(i - 1), args);
        }
      }
      throw new TypeError(`No applicable method for ${name}(${args.join(', ')})`); 
    }
    if (options.on_call) {
      return options.on_call.apply(mk$next(f.methods.length - 1), args);
    } else {
      return next(f.methods.length - 1);
    }
  }
  f.methods = [];
  f.add_method = function (m) {
    f.methods.push(m);
  };
  f.add_default_method = function (m) {
    f.methods.unshift(m);
  };
  f.find_method = function (name) {
    let i = f.methods.findIndex(m => m.name === name);
    if (i === -1) {
      throw new Error("No such method with name " + name);
    }
    return i;
  };
  f.add_method_before = function (name, method) {
    f.methods.splice(f.find_method(name), 0, method);
  };
  f.add_method_after = function (name, method) {
    f.methods.splice(f.find_method(name) + 1, 0, method);
  };
  f.remove_method = function (name) {
    f.methods.splice(f.find_method(name), 1);
  };
  return f;
}

// Example
var foo = make_generic_function("foo");
foo.add_method({
  name: "int",
  when: (i) => typeof i === "number",
  handle: (i) => `got the integer ${i}`
});
foo.add_method({
  name: "string",
  when: (s) => typeof s === "string",
  handle: (s) => `got the string "${s}"`
});
foo.add_method({
  name: "string is foo",
  when: (s) => s === "foo",
  handle: (s) => `congrats! you passed in "foo"`
});
foo.add_method({
  name: "check if string is bar inside the handler",
  when: () => true,
  handle: function (s) {
    if (s === "bar") {
      return "it's bar";
    } else{
      return this.next();
    }
  }
});


/*** Properties ***/

/*
A property is a generic function that is meant to be mutated.
We take some care to store property values in a central location to
support saving games.
*/

/* This is data behind all the properties. It should not be used directly. */
var world_data = {};

/* The "world" is an object containing all the generic functions related to objects. */
var world = {};

/* The world has an actor that is doing things and a player that is observing.  Usually these are equal. */
world.actor = "player";
world.player = "player";

function with_actor(actor, f) {
  /* Call the function f in the context of the world being with respect to a given actor.  */
  var old_actor = world.actor;
  world.actor = actor;
  try {
    return f();
  } finally {
    world.actor = old_actor;
  }
}

function def_property(name, arity, options) {
  if (typeof arity !== "number") {
    throw new TypeError("Expecting arity");
  }
  options = options || {};
  if (world[name]) {
    console.warn("def_property: world already has '%s'", name);
  }
  var data = world_data[name] = new Map;
  world[name] = make_generic_function(name, {
    on_call: function() {
      if (arguments.length !== arity) {
        throw new TypeError("Expecting " + arity + " arguments");
      }
      let values = data;
      for (let i = 0; i < arguments.length; i++) {
        if (!values.has(arguments[i])) {
          /* the default value should be used */
          return this.next();
        }
        values = values.get(arguments[i]);
      }
      /* got to the end -- this is the value */
      return values;
    }
  });
  world[name].set = function () {
    /* Takes `arity + 1` arguments, with the last argument being the new value. */
    if (arguments.length !== arity + 1) {
      throw new TypeError("Expecting " + (arity + 1) + " arguments");
    }
    let values = data;
    for (let i = 0; i < arguments.length - 2; i++) {
      if (values.has(arguments[i])) {
        values = values.get(arguments[i]);
      } else {
        values.set(arguments[i], new Map);
        values = values.get(arguments[i]);
      }
    }
    values.set(arguments[arguments.length - 2], arguments[arguments.length - 1]);
  };
}

/*** Activities ***/

/* An activity is a generic function defined on `world`. */
function def_activity(name, options) {
  options = options || {};
  if (world[name]) {
    console.warn("def_activity: world already has '%s'", name);
  }
  world[name] = make_generic_function(name);
}

/*** Relations ***/

/* A binary relation where each object is related to at most one other
object.  If `options.has_tag` is set, then things that are related can
be given a tag giving extra information about that relation. */
function def_many_to_one_relation(name, options) {
  options = options || {};
  if (world[name]) {
    console.warn("def_many_to_one_relation: world already has '%s'", name);
  }
  var data = world_data[name] = {
    mapping: new Map,
    back_mapping: new Map /* map to arrays recording all x for which x is related to something */
  };
  if (options.has_tag) {
    data.tags = new Map; /* optional tags for each related thing */
  }
  var f = world[name] = function(o, /*opt*/tag) {
    /* Returns what the object is related to or null. If there is a tag, then returns null unless the
       relation has that tag. */
    if (data.mapping.has(o)) {
      if (options.has_tag && arguments.length === 2) {
        if (data.tags.get(o) !== tag) {
          return null;
        }
      }
      return data.mapping.get(o);
    } else {
      return null;
    }
  };
  f.is_related = function (o, /*opt*/tag) {
    /* Returns whether the object is related to something. */
    if (options.has_tag && arguments.length === 2) {
      return data.mapping.has(o) && data.tags.get(o) === tag;
    } else {
      return data.mapping.has(o);
    }
  };
  if (options.has_tag) {
    f.tag = function (o) {
      /* Returns the tag associated with o being related to something, or undefined. */
      return data.tags.get(o);
    };
  }
  f.clear_for = function (o) {
    /* Clear that o is related to anything. */
    if (data.mapping.has(o)) {
      var o2 = data.mapping.get(o);
      var back = data.back_mapping.get(o2);
      back.splice(back.indexOf(o), 1);
      data.mapping.delete(o);
      if (options.has_tag) {
        data.tags.delete(o);
      }
    }
  };
  f.relate = function (o1, o2, /*opt*/tag) {
    /* relate o1 to o2, with an optional tag.  then the value associated to o1 will be o2. */
    f.clear_for(o1);
    data.mapping.set(o1, o2);
    if (options.has_tag) {
      data.tags.set(o1, tag);
    }
    var back = data.back_mapping.get(o2);
    if (!back) {
      back = [];
      data.back_mapping.set(o2, back);
    }
    back.push(o1);
  };
  f.related_to = function (o2, /*opt*/tag) {
    /* get all o1 that are related to o2.  If a second argument is present, restricts to those with that tag. */
    var back = data.back_mapping.get(o2);
    if (!back) {
      return [];
    }
    if (options.has_tag && arguments.length >= 2) {
      return back.filter(o1 => f.tag(o1) === tag);
    } else {
      return back.slice();
    }
  };
  return f;
}

function def_tagged_many_to_many_relation(name, options) {
  options = options || {};
  if (world[name]) {
    console.warn("def_tagged_many_to_many_relation: world already has '%s'", name);
  }
  var data = world_data[name] = {
    mapping: new Map
  };
  var f = world[name] = function (o) {
    /* Returns the list of things o is related to, along with tags.  These are given as objects
       {obj, tag}. */
    var rel = data.mapping.get(o) || [];
    return rel.map(r => ({obj: r.obj, tag: r.tag}));
  };
  f.relate = function (o1, o2, tag) {
    var rel = data.mapping.get(o1);
    if (!rel) {
      rel = [];
      data.mapping.set(o1, rel);
    }
    for (var i = 0; i < rel.length; i++) {
      if (rel[i].tag === tag) {
        rel[i].obj = o2;
        return;
      }
    }
    rel.push({obj: o2, tag: tag});
  };
}

/*** Kinds ***/

def_many_to_one_relation("kind", {
  doc: "An object is something with a kind. The kind determines the object's basic behavior."
});
def_many_to_one_relation("kind_of", 1, {
  doc: "Every kind inherits from another kind.  This is through the is_a function."
});

/* Define a new kind with a particular parent kind. */
function def_kind(name, parent) {
  world.kind.relate(name, "kind"); // the kind of a kind is "kind"
  if (parent) {
    world.kind_of.relate(name, parent);
  }
}

/* These are definitions of the core kinds in the world, where a kind
is something like a class of objects. */

def_kind("kind", null); // the root kind
def_kind("room", null);
def_kind("thing", null);
def_kind("door", "thing");
def_kind("container", "thing");
def_kind("supporter", "thing");
def_kind("person", "thing");
def_kind("backdrop", "thing");
def_kind("region", null);

/*
The choice of these kinds was greatly influenced by Inform 7.  Every
kind has the kind "kind".  The following are basic properties of the
other kinds.

A room represents a place.  These are not contained in anything, and
can be a part of an Exit relation.

A thing represents some object that can be interacted with.

A door is a thing which can be in two rooms and which also can be
part of the Exit relation.
 
Containers and supporters are things which can respectively contain
and support things.  These are distinct because it simplifies the core
library (as enterables, these two end up being mutually exclusive).

Persons represent objects with which one can communicate.  This also
encompasses the player character.

Backdrops are things which can be present in multiple rooms (that is,
there is a rule which moves backdrop to an appropriate room),
effectively breaking the rule that things can't be in more than one
room.

Regions are kinds which can contain rooms, which breaks the rule
that rooms are not contained in anything.  These are used to group
together rooms for rules.
*/

def_activity("is_a", {
  doc: "is_a(o, k) checks if o has kind k, transitively through kind_of"
});
world.is_a.add_method({
  // A sanity check: only apply if o is an object (it has a kind) and k is a kind.
  when: (o, k) => world.kind(o) && world.kind(k) === "kind",
  handle: function (o, k) {
    var o_kind = world.kind(o);
    while (o_kind !== null) {
      if (o_kind === k) {
        return true;
      }
      o_kind = world.kind_of(o_kind);
    }
    return false;
  }
});

def_many_to_one_relation("location", {
  has_tag: true,
  doc: `the location of an object is another object, and the location relation is tagged with
one of five things: contained_by, supported_by, owned_by, part_of, worn_by`
});

def_activity("put_in", {
  doc: "make something be contained by something.  This should be used for a container or a room."
});
world.put_in.add_method({
  name: "default",
  handle: function (obj, container) {
    world.location.relate(obj, container, "contained_by");
  }
});

def_activity("put_on", {
  doc: "make something be supported by something.  This should be used for a supporter."
});
world.put_on.add_method({
  name: "default",
  handle: function (obj, supporter) {
    world.location.relate(obj, supporter, "supported_by");
  }
});

def_activity("give_to", {
  doc: "make something be owned by something.  This should be used for a person."
});
world.give_to.add_method({
  name: "default",
  handle: function (obj, recipient) {
    world.location.relate(obj, recipient, "owned_by");
  }
});

def_activity("make_part_of", {
  doc: "make something be part of something."
});
world.make_part_of.add_method({
  name: "default",
  handle: function (part, obj) {
    world.location.relate(part, obj, "part_of");
  }
});

def_activity("make_wear", {
  doc: "make someone wear something."
});
world.make_wear.add_method({
  name: "default",
  handle: function (person, article) {
    world.location.relate(article, person, "worn_by");
  }
});

def_activity("remove_obj", {
  doc: "Effectively remove an object from play by clearing its location."
});
world.remove_obj.add_method({
  name: "default",
  handle: function (obj) {
    world.location.clear_for(obj);
  }
});

def_property("contains", 2, {
  doc: `Given two objects, determine whether the second object transitively contains
(via the location) the first.  An object does not contain itself.`
});
world.contains.add_method({
  name: "default",
  handle: function (o1, o2) {
    o1 = world.location(o1);
    for (; o1; o1 = world.location(o1)) {
      if (o1 === o2) {
        return true;
      }
    }
    return false;
  }
});

def_property("owner", 1, {
  doc: "Get the owner of an object.  Use `give_to` to change immediate ownership."
});
world.owner.add_method({
  name: "default",
  handle: function (obj) {
    /* Returns the first thing in the location chain that is from an "owned_by" tag. */
    while (true) {
      if (world.location(obj) === null) {
        return null;
      } else if (world.location.tag(obj) === "owned_by") {
        return world.location(obj);
      } else {
        obj = world.location(obj);
      }
    }
  }
});

def_activity("all_of_kind");
world.all_of_kind.add_method({
  name: "default",
  handle: function (kind) {
    /* Get all the objects in the world that inherit from a given kind (via `is_a`) */
    var kinds = [kind];
    var objects = [];
    while (kinds.length) {
      kind = kinds.pop();
      objects = objects.concat(world.kind.related_to(kind));
      kinds = kinds.concat(world.kind_of.related_to(kind));
    }
    return objects;
  }
});

def_activity("all_things");
world.all_things.add_method({
  name: "default",
  handle: function () {
    /* Get all the things in the world (that is, all objects that are a 'thing' via 'is_a' */
    return world.all_of_kind("thing");
  }
});

def_activity("all_rooms");
world.all_rooms.add_method({
  name: "default",
  handle: function () {
    /* Get all the rooms in the world (that is, all objects that are a 'room' via 'is_a' */
    return world.all_of_kind("room");
  }
});

def_tagged_many_to_many_relation("exits", {
  doc: "relation between rooms, with the tag being the direction of the exit."
});

def_property("inverse_direction", 1);
function add_direction_pair(dir, opp) {
  world.inverse_direction.set(dir, opp);
  world.inverse_direction.set(opp, dir);
}
add_direction_pair("north", "south");
add_direction_pair("west", "east");
add_direction_pair("northwest", "southeast");
add_direction_pair("northeast", "southwest");
add_direction_pair("up", "down");
add_direction_pair("in", "out");

def_activity("connect_rooms");
world.connect_rooms.add_method({
  name: "default",
  handle: function(room1, dir, room2, options) {
    options = options || {};
    world.exits.relate(room1, room2, dir);
    if (!options.one_way) {
      world.exits.relate(room2, room1, world.inverse_direction(dir));
    }
  }
});

/*** Defining objects ***/

function def_obj(name, kind, props, activities) {
  if (world.kind(kind) !== "kind") {
    throw new TypeError("kind must be a kind");
  }
  if (typeof name !== "string") {
    throw new TypeError("object id must be a string");
  }
  world.kind.relate(name, kind);
  for (let key in props || {}) {
    let val = props[key];
    if (typeof val === "function") {
      world[key].add_method({
        name: name,
        when: (o) => o === name,
        handle: val
      });
    } else {
      world[key].set(name, props[key]);
    }
  }
  for (let key in activities || {}) {
    world[key](name, activities[key]);
  }
}

/*** Basic properties ***/

def_property("name", 1, {
  doc: `Represents the name of an object of some kind.  This lets the id of an object
be differentiated from what the user will call it.`
});
world.name.add_method({
  name: "default",
  when: (x) => world.kind(x),
  handle: (x) => ''+x
});

def_property("proper_named", 1, {
  doc: `Represents whether or not the name of something is a proper
name.  For inhibiting the article for definite_name and indefinite_name.`
});
world.proper_named.add_method({
  name: "default",
  when: (x) => world.kind(x),
  handle: (x) => false
});

def_property("printed_name", 1, {
  doc: `Gives a textual representation of an object which can then be
prefaced by an article (that is, unless proper_named is true). This is
separate from the name property because it might be dynamic in some way.
(Note: this property might not be necessary.)`
});
world.printed_name.add_method({
  name: "default",
  when: (x) => world.kind(x),
  handle: (x) => world.name(x)
});

def_property("definite_name", 1, {
  doc: `Gives the definite name of an object. For instance, "the ball" or "Bob".`
});
world.definite_name.add_method({
  name: "default",
  when: (x) => world.kind(x),
  handle: function (x) {
    if (world.proper_named(x)) {
      return world.printed_name(x);
    } else {
      return "the " + world.printed_name(x);
    }
  }
});

def_property("indefinite_name", 1, {
  doc: `Gives the indefinite name of an object, for instance "a ball" or "Bob".`
});
world.indefinite_name.add_method({
  name: "default",
  when: (x) => world.kind(x),
  handle: function (x) {
    var printed_name = world.printed_name(x);
    if (world.proper_named(x)) {
      return printed_name;
    } else if (printed_name.match(/^[aoiou]/i)) {
      return "an " + printed_name;
    } else {
      return "a " + printed_name;
    }
  }
});

def_property("description", 1, {
  doc: `Represents a textual description of an object. There is no default value for this.`
});

def_property("words", 1, {
  doc: `This represents a list of words that can describe the object.
Words may be prefixed with @ to denote that they are nouns (and matching a noun
gives higher priority to the disambiguator, but keep in mind that there is no match when
an adjective comes after a noun: ["red", "@ball"] will match "red", "ball", and "red ball",
but not "ball red").`
});

def_property("added_words", 1, {
  doc: `This represents a list of additional words that can describe the object.
These are used by the default words handler to add more synonoyms to something. The
contents follow the same rules as for words.`
});
world.added_words.add_method({
  name: "default",
  handle: (x) => []
});

world.words.add_method({
  name: "default",
  handle: function (x) {
    /* The default handler assumes that the words in `world.name(x)` are suitable
       for the object, and furthermore that the last word is a noun (so "big red ball"
       returns `["big", "red", "@ball"]`. */
    var words = world.name(x).split(" ");
    words[words.length - 1] = "@" + words[words.length - 1];
    return words.concat(world.added_words(x));
  }
});

/*** Rooms ***/

world.description.add_method({
  name: "room default",
  when: (x) => world.is_a(x, "room"),
  handle: (x) => null
});

world.proper_named.add_method({
  name: "room default",
  when: (x) => world.is_a(x, "room"),
  handle: (x) => true
});

def_property("direction_description", 2, {
  doc: `Represents a description of a certain direction in a room.`
});
world.direction_description.add_method({
  name: "default",
  handle: (x, dir) => "{Bobs} {see} nothing in particular that way."
});

def_property("visited", 2, {
  doc: `Represents whether a room has been visited by someone.`
});
world.visited.add_method({
  name: "room default",
  when: (x, person) => world.is_a(x, "room") && world.is_a(x, "person"),
  handle: (x, person) => false
});

def_activity("get_room_doors", {
  doc: "Get a list of doors that are in a particular room."
});
world.get_room_doors.add_method({
  name: "default room doors",
  when: (x) => world.is_a(x, "room"),
  handle: function (x) {
    var doors = [];
    world.exits(x).forEach(o => {
      if (world.is_a(o.obj, "door")) {
        doors.push(o.obj);
      }
    });
    return doors;
  }
});

def_property("contents", 1, {
  doc: `Gets the list of things which are immediate contents of the object.`
});
world.contents.add_method({
  name: "room contents",
  when: (x) => world.is_a(x, "room"),
  handle: function (x) {
    return world.location.related_to(x).concat(world.get_room_doors(x));
  }
});

def_property("effective_container", 1, {
  doc: `Relative to this object, gives the object in the location chain that most reasonably
contains its contents.  For example, if the object is a closed box, then the box is the
effective container, otherwise if the box is open then the effective container is the effective
container of the location of the box.`
});
world.effective_container.add_method({
  name: "room effective container",
  when: (x) => world.is_a(x, "room"),
  handle: (x) => x
});

def_property("visible_container", 1, {
  doc: `Like the effective container, but takes into account opaqueness of objects to find the
most reasonable container that has all visible objects.`
});
world.visible_container.add_method({
  name: "room visible container",
  when: (x) => world.is_a(x, "room"),
  handle: (x) => x
});

def_property("makes_light", 1, {
  doc: `Represents whether the object is a source of light, irrespective of whether (in
the case of a container) its contents provide light. That is, an open box with a lightbulb in
it does not make light.`
});
world.makes_light.add_method({
  name: "rooms make light",
  when: (x) => world.is_a(x, "room"),
  handle: (x) => true
});

def_property("contributes_light", 1, {
  doc: `Represents whether the object is a source of light to its location.`
});

def_property("contains_light", 1, {
  doc: `Represents whether the object is illuminated from the inside due
to some light source, which may be itself. Something that contains light need not
contribute light to its location.`
});

world.contains_light.add_method({
  name: "room if make light",
  when: (x) => world.is_a(x, "room"),
  handle: (x) => world.makes_light(x)
});
world.contains_light.add_method({
  name: "room if contents contribute light",
  when: (x) => world.is_a(x, "room") && world.contents(x).some(o => world.contributes_light(o)),
  handle: (x) => true
});

def_property("no_go_msg", 2, {
  doc: `Takes a room and a direction and gives the reason one can't go that way.`
});
world.no_go_msg.add_method({
  name: "default",
  when: (x, dir) => world.is_a(x, "room"),
  handle: (x, dir) => `{Bob} can't go that way.`
});

def_property("when_go_msg", 2, {
  doc: `Takes a room and a direction and gives a message for reporting going that way.`
});
world.when_go_msg.add_method({
  name: "default",
  when: (x, dir) => world.is_a(x, "room"),
  handle: (x, dir) => null
});

def_activity("get_room_exit_directions", {
  doc: `Gets the directions in which one can leave a room.`
});
world.get_room_exit_directions.add_method({
  name: "default",
  handle: function (room) {
    return world.exits(room).map(e => e.tag);
  }
});

/*** Things ***/

world.description.add_method({
  name: "thing default",
  when: (x) => world.is_a(x, "thing"),
  handle: (x) => null
});

world.makes_light.add_method({
  name: "thing default",
  when: (x) => world.is_a(x, "thing"),
  handle: (x) => false
});

world.contributes_light.add_method({
  name: "thing default",
  when: (x) => world.is_a(x, "thing"),
  handle: (x) => false
});
world.contributes_light.add_method({
  name: "thing if makes light",
  when: (x) => world.is_a(x, "thing") && world.makes_light(x),
  handle: (x) => true
});
world.contributes_light.add_method({
  name: "thing if part makes light",
  when: (x) => world.is_a(x, "thing") && world.location.related_to(x, "part_of").some(o => world.contributes_light(o)),
  handle: (x) => true
});

world.contains_light.add_method({
  name: "thing default",
  when: (x) => world.is_a(x, "thing"),
  handle: (x) => false
});

world.effective_container.add_method({
  name: "thing default",
  when: (x) => world.is_a(x, "thing"),
  handle: function (x) {
    /* We assume that we only care about the effective container of a regular
       thing if it has constituent parts. With this assumption, we then say that
       the effective container of a thing is that of its location. */
    var loc = world.location(x);
    if (loc) {
      return world.effective_container(loc);
    } else {
      return x;
    }
  }
});

world.visible_container.add_method({
  name: "thing default",
  when: (x) => world.is_a(x, "thing"),
  handle: function (x) {
    /* We assume that we only care about the visible container of a regular
       thing if it has constituent parts. With this assumption, we then say that
       the visible container of a thing is that of its location. */
    var loc = world.location(x);
    if (loc) {
      return world.visible_container(loc);
    } else {
      return x;
    }
  }
});

def_activity("containing_room", {
  doc: `Gets the room which contains the given object.`
});
world.containing_room.add_method({
  name: "default",
  handle: function (x) {
    var loc = world.location(x);
    while (loc && !world.is_a(loc, "room")) {
      loc = world.location(loc);
    }
    return loc;
  }
});

def_property("notable_description", 1, {
  doc: `Represents a special textual description of an object if it is
notable enough to be put in a special paragraph in a location description.
If it is set to false, then it is take to mean there is no such paragraph.`
});
world.notable_description.add_method({
  name: "default",
  handle: (x) => false
});

def_property("reported", 1, {
  doc: `Represents whether the object should be automatically reported in room descriptions.`
});
world.reported.add_method({
  name: "default",
  handle: (x) => false
});

def_property("subject_pronoun", 1, {
  doc: `Represents the pronoun for when the object is the subject of a sentence.`
});
def_property("object_pronoun", 1, {
  doc: `Represents the pronoun for when the object is the object of a sentence.`
});
def_property("possessive_determiner", 1, {
  doc: `Represents the possessive determiner of the object.`
});
def_property("possessive_pronoun", 1, {
  doc: `Represents the possessive pronoun of the object.`
});
def_property("reflexive_pronoun", 1, {
  doc: `Represents the reflexive pronoun of the object.`
});
world.subject_pronoun.add_method({
  name: "default thing",
  when: (x) => world.is_a(x, "thing"),
  handle: (x) => "it"
});
world.object_pronoun.add_method({
  name: "default thing",
  when: (x) => world.is_a(x, "thing"),
  handle: (x) => "it"
});
world.possessive_determiner.add_method({
  name: "default thing",
  when: (x) => world.is_a(x, "thing"),
  handle: (x) => "its"
});
world.possessive_pronoun.add_method({
  name: "default thing",
  when: (x) => world.is_a(x, "thing"),
  handle: (x) => "its"
});
world.reflexive_pronoun.add_method({
  name: "default thing",
  when: (x) => world.is_a(x, "thing"),
  handle: (x) => "itself"
});

def_property("fixed_in_place", 1, {
  doc: `Represents something that can't be taken because it's fixed in place.
For instance, scenery.`
});
world.fixed_in_place.add_method({
  name: "default thing",
  when: (x) => world.is_a(x, "thing"),
  handle: (x) => false
});

def_property("no_take_msg", 1, {
  doc: `Represents the message for trying to take something that is fixed in place.`
});
world.no_take_msg.add_method({
  name: "default thing",
  when: (x) => world.fixed_in_place(x),
  handle: (x) => "That's fixed in place."
});

def_property("visible_to", 2, {
  doc: `visible_to(x, actor) checks whether x is visible to the actor.`
});
world.visible_to.add_method({
  name: "default",
  handle: (x, actor) => false
});
world.visible_to.add_method({
  name: "visible if location is actor",
  when: (x, actor) => world.location(x) === actor,
  handle: (x, actor) => true
});
world.visible_to.add_method({
  name: "visible if in same visible container",
  when: (x, actor) => true,
  handle: function (x, actor) {
    /* Anything in the same visible container to the actor is visible if the visible container
       is lit. */
    var actor_vis_cont;
    var actor_loc = world.location(actor);
    if (actor_loc === null) {
      actor_vis_cont = actor;
    } else {
      actor_vis_cont = world.visible_container(actor_loc);
    }
//    if (world.kind(actor_vis_cont) === "room" && world.get_room_doors(actor_vis_cont).includes(x)) {
//      return true;
//    }
    var x_vis_cont;
    if (x === actor_vis_cont) {
      x_vis_cont = x;
    } else {
      var x_loc = world.location(x);
      if (x_loc === null) {
        return this.next();
      }
      x_vis_cont = world.visible_container(x_loc);
    }
    if (actor_vis_cont === x_vis_cont && world.contains_light(actor_vis_cont)) {
      return true;
    } else {
      return this.next();
    }
  }
});
world.visible_to.add_method({
  name: "visible if part of",
  handle: function (x, actor) {
    /* if an object is part of something, and that something is visible, then the object is visible */
    var assembly = world.location(x, "part_of");
    if (assembly !== null && world.visible_to(assembly, actor)) {
      return true;
    } else {
      return this.next();
    }
  }
});

def_property("accessible_to", 2, {
  doc: `accessible_to(x, actor) checks whether actor can access x -- whether they can reach it.`
});
world.accessible_to.add_method({
  name: "accessible if in same effective container",
  when: (x, actor) => true,
  handle: function (x, actor) {
    /* Anything in the same effective container to the actor is accessible. */
    var actor_eff_cont = world.effective_container(world.location(actor));
//    if (world.kind(actor_eff_cont) === "room" && world.get_room_doors(actor_eff_cont).includes(x)) {
//      return true;
//    }
    if (actor_eff_cont === x) {
      return true;
    } else {
      return actor_eff_cont === world.effective_container(world.location(x));
    }
  }
});
world.accessible_to.add_method({
  name: "accessible if part of",
  handle: function (x, actor) {
    /* if an object is part of something, and that something is accessible, then the object is accessible */
    var assembly = world.location(x, "part_of");
    if (assembly !== null && world.accessible_to(assembly, actor)) {
      return true;
    } else {
      return this.next();
    }
  }
});
world.accessible_to.add_method({
  name: "not accessible if not visible",
  when: (x, actor) => !world.visible_to(x, actor),
  handle: (x, actor) => false
});

def_property("is_opaque", 1, {
  doc: `Represents whether the object cannot transmit light.`
});
world.is_opaque.add_method({
  name: "default opaque",
  when: (x) => world.is_a(x, "thing"),
  handle: (x) => true
});

def_property("is_enterable", 1, {
  doc: `Is true if the object is something someone could enter.`
});
world.is_enterable.add_method({
  name: "default",
  when: (x) => world.is_a(x, "thing"),
  handle: (x) => false
});

def_property("no_enter_msg", 1, {
  doc: `Gives a message for why one is unable to enter the object (when is_enterable is not true).`
});
world.no_enter_msg.add_method({
  name: "default",
  when: (x) => world.is_a(x, "thing"),
  handle: (x) => `{Bob} can't enter that.`
});

def_property("parent_enterable", 1, {
  doc: `Gives the next object in the location chain that is enterable (or null).
Assumes rooms are enterable for this purpose.`
});
world.parent_enterable.add_method({
  name: "default",
  when: (x) => world.is_a(x, "thing"),
  handle: function (x) {
    var loc = world.location(x);
    if (loc === null) {
      return null;
    }
    while (!world.is_a(loc, "room")) {
      if (world.is_enterable(loc)) {
        return loc;
      }
      loc = world.location(loc);
      if (loc === null) {
        return null;
      }
    }
    return loc;
  }
});

def_property("locale_description", 1, {
  doc: `A locale description for enterables. If it is null, then it is ignored.`
});
world.locale_description.add_method({
  doc: "default",
  when: (x) => world.is_enterable(x),
  handle: (x) => null
});

def_property("is_wearable", 1, {
  doc: `Represents whether something could be worn by a person.`
});
world.is_wearable.add_method({
  doc: "default",
  when: (x) => world.is_a(x, "thing"),
  handle: (x) => false
});

def_property("is_edible", 1, {
  doc: `Represents whether something could be eaten.`
});
world.is_edible.add_method({
  doc: "default",
  when: (x) => world.is_a(x, "thing"),
  handle: (x) => false
});

/*** doors ***/

world.put_in.add_method({
  name: "not for doors",
  when: (x) => world.is_a(x, "door"),
  handle: function (x) {
    throw new TypeError("Use connect_rooms to put a door in a room.");
  }
});

world.fixed_in_place.add_method({
  name: "doors are fixed in place",
  when: (x) => world.is_a(x, "door"),
  handle: (x) => true
});

world.visible_to.add_method({
  name: "doors",
  when: (x, actor) => world.is_a(x, "door"),
  handle: function (x, actor) {
    var loc = world.location(actor);
    if (loc === null) {
      return this.next();
    }
    loc = world.visible_container(loc);
    if (!world.is_a(loc, "room")) {
      return this.next();
    }
    return world.get_room_doors(loc).includes(x);
  }
});

world.accessible_to.add_method({
  name: "doors",
  when: (x, actor) => world.is_a(x, "door"),
  handle: function (x, actor) {
    var loc = world.location(actor);
    if (loc === null) {
      return this.next();
    }
    loc = world.effective_container(loc);
    if (!world.is_a(loc, "room")) {
      return this.next();
    }
    return world.get_room_doors(loc).includes(x);
  }
});

def_activity("door_other_side_from", {
  doc: `Gets the room on the other side of a door from a given room.`
});
world.door_other_side_from.add_method({
  name: "default",
  handle: function (door, room) {
    var rooms = world.exits(door);
    if (rooms.length !== 2) {
      throw new Error("Doors must have exactly two exits");
    }
    if (rooms[0].obj === room) {
      return rooms[1].obj;
    } else if (rooms[1].obj === room) {
      return rooms[0].obj;
    } else {
      throw new Error("Neither side of the door is the room " + room);
    }
  }
});

/*** openability and such ***/

def_property("openable", 1, {
  doc: `Represents whether an object is able to be opened or closed`
});

def_property("is_open", 1, {
  doc: `Represents whether an openable object is currently open`
});

world.openable.add_method({
  name: "default",
  when: (o) => world.is_a(o, "thing"),
  handle: (o) => false
});

world.is_open.add_method({
  name: "default closed",
  when: (o) => world.openable(o),
  handle: (o) => false
});

world.openable.add_method({
  name: "doors",
  when: (o) => world.is_a(o, "door"),
  handle: (o) => true
});

def_property("no_open_msg", 2, {
  doc: `Represents the messages for not being able to open or close an object.`
});
world.no_open_msg.add_method({
  name: "no_open default",
  when: (o, type) => type === "no_open",
  handle: (o, type) => `{Bob} can't open that.`
});
world.no_open_msg.add_method({
  name: "no_close default",
  when: (o, type) => type === "no_close",
  handle: (o, type) => `{Bob} can't close that.`
});
world.no_open_msg.add_method({
  name: "already_open default",
  when: (o, type) => type === "already_open",
  handle: (o, type) => "That's already open."
});
world.no_open_msg.add_method({
  name: "already_closed default",
  when: (o, type) => type === "already_closed",
  handle: (o, type) => "That's already closed."
});

def_property("is_open_msg", 1, {
  doc: `A string representing the state of the openable object`
});
world.is_open_msg.add_method({
  name: "default closed",
  when: (o) => world.openable(o) && !world.is_open(o),
  handle: (o) => "closed"
});
world.is_open_msg.add_method({
  name: "default open",
  when: (o) => world.openable(o) && world.is_open(o),
  handle: (o) => "open"
});

/*** lockability ***/

def_property("lockable", 1, {
  doc: `Represents whether an object can be locked and unlocked.`
});

def_property("is_locked", 1, {
  doc: `Represents whether a lockable object is currently locked.`
});

world.lockable.add_method({
  name: "default thing",
  when: (o) => world.is_a(o, "thing"),
  handle: (o) => false
});

world.is_locked.add_method({
  name: "lockable default locked",
  when: (o) => world.lockable(o),
  handle: (o) => true
});

def_property("key_of_lock", 2, {
  doc: `key_of_lock(key, lock) gives whether or not the key can unlock the given lock.`
});
world.key_of_lock.add_method({
  name: "default not a key",
  when: (key, lock) => world.lockable(lock),
  handle: (key, lock) => false
});

def_property("wrong_key_msg", 2, {
  doc: `wrong_key_msg(key, lock) gives a message for why the particular key doesn't work for this lock.`
});
world.wrong_key_msg.add_method({
  name: "default",
  when: (key, lock) => world.lockable(lock),
  handle: (key, lock) => "That doesn't fit the lock."
});

def_property("no_lock_msg", 2, {
  doc: `Represents the messages for not being able to lock or unlock an object.`
});
world.no_lock_msg.add_method({
  name: "no_lock default",
  when: (o, type) => type === "no_lock",
  handle: (o, type) => `{Bob} doesn't appear to be lockable.`
});
world.no_lock_msg.add_method({
  name: "no_unlock default",
  when: (o, type) => type === "no_unlock",
  handle: (o, type) => `{Bob} doesn't appear to be unlockable.`
});
world.no_lock_msg.add_method({
  name: "no_open default",
  when: (o, type) => type === "no_open",
  handle: (o, type) => "It's locked"
});
world.no_lock_msg.add_method({
  name: "already_locked default",
  when: (o, type) => type === "already_locked",
  handle: (o, type) => "It's already locked."
});
world.no_lock_msg.add_method({
  name: "already_unlocked default",
  when: (o, type) => type === "already_unlocked",
  handle: (o, type) => "It's already unlocked."
});

/*** Container ***/

world.contents.add_method({
  name: "container default",
  when: (x) => world.is_a(x, "container"),
  handle: (x) => world.location.related_to(x, "contained_by")
});

def_property("suppress_content_description", 1, {
  doc: `Represents whether to suppress the description of the contents of an object
when examining it.`
});

world.suppress_content_description.add_method({
  name: "default container",
  when: (x) => world.is_a(x, "container"),
  handle: (x) => false
});

world.is_opaque.add_method({
  name: "default container",
  when: (x) => world.is_a(x, "container"),
  handle: (x) => false
});
world.is_opaque.add_method({
  name: "openable container is closed",
  when: (x) => world.is_a(x, "container") && world.openable(x) && !world.is_open(x),
  handle: (x) => true
});

world.contains_light.add_method({
  name: "container",
  when: (x) => world.is_a(x, "container") && world.contents(x).some(o => world.contributes_light(o)),
  handle: (x) => true
});

world.contributes_light.add_method({
  name: "container",
  when: (x) => world.is_a(x, "container") && !world.is_opaque(x) && world.contains_light(x),
  handle: (x) => true
});

world.visible_container.add_method({
  name: "container",
  when: (x) => world.is_a(x, "container") && world.is_opaque(x),
  handle: (x) => x
});

world.effective_container.add_method({
  name: "container",
  when: (x) => world.is_a(x, "container") && (world.is_opaque(x) || (world.openable(x) && world.is_closed(x))),
  handle: (x) => x
});

/*** Supporter ***/

world.contents.add_method({
  name: "supporter default",
  when: (x) => world.is_a(x, "supporter"),
  handle: (x) => world.location.related_to(x, "supported_by")
});

world.suppress_content_description.add_method({
  name: "default supporter",
  when: (x) => world.is_a(x, "supporter"),
  handle: (x) => false
});

world.is_opaque.add_method({
  name: "default supporter",
  when: (x) => world.is_a(x, "supporter"),
  handle: (x) => false
});

world.contains_light.add_method({
  name: "supporter",
  when: (x) => world.is_a(x, "supporter") && world.contents(x).some(o => world.contributes_light(o)),
  handle: (x) => true
});

world.contributes_light.add_method({
  name: "supporter",
  when: (x) => world.is_a(x, "supporter") && world.contains_light(x),
  handle: (x) => true
});

/*** Person ***/

world.proper_named.add_method({
  name: "person",
  when: (x) => world.is_a(x, "person"),
  handle: (x) => true
});

world.contents.add_method({
  name: "person",
  when: (x) => world.is_a(x, "person"),
  handle: function (x) {
    var possessions = world.location.related_to(x, "owned_by");
    var clothes = world.location.related_to(x, "worn_by");
    return possessions.concat(clothes);
  }
});

def_property("gender", 1, {
  doc: `Represents the gender of a person.  We implement a few common ones.`
});
world.gender.add_method({
  name: "default",
  when: (x) => world.is_a(x, "person"),
  handle: (x) => "unknown"
});

world.subject_pronoun.add_method({
  name: "person",
  when: (x) => world.is_a(x, "person"),
  handle: function (x) {
    var gender = world.gender(x);
    switch (gender) {
    case "male":
      return "he";
    case "female":
      return "she";
    case "none":
      return "it";
    default:
      return "they";
    }
  }
});

world.object_pronoun.add_method({
  name: "person",
  when: (x) => world.is_a(x, "person"),
  handle: function (x) {
    var gender = world.gender(x);
    switch (gender) {
    case "male":
      return "him";
    case "female":
      return "her";
    case "none":
      return "it";
    default:
      return "them";
    }
  }
});

world.possessive_determiner.add_method({
  name: "person",
  when: (x) => world.is_a(x, "person"),
  handle: function (x) {
    var gender = world.gender(x);
    switch (gender) {
    case "male":
      return "his";
    case "female":
      return "her";
    case "none":
      return "its";
    default:
      return "their";
    }
  }
});

world.possessive_pronoun.add_method({
  name: "person",
  when: (x) => world.is_a(x, "person"),
  handle: function (x) {
    var gender = world.gender(x);
    switch (gender) {
    case "male":
      return "his";
    case "female":
      return "hers";
    case "none":
      return "its";
    default:
      return "theirs";
    }
  }
});

world.reflexive_pronoun.add_method({
  name: "person",
  when: (x) => world.is_a(x, "person"),
  handle: function (x) {
    var gender = world.gender(x);
    switch (gender) {
    case "male":
      return "himself";
    case "female":
      return "herself";
    case "none":
      return "itself";
    default:
      return "themself";
    }
  }
});

def_property("subject_pronoun_if_me", 1, {
  doc: `Represents the subject pronoun when referring to the current actor.`
});
def_property("object_pronoun_if_me", 1, {
  doc: `Represents the object pronoun when referring to the current actor.`
});
def_property("possessive_determiner_if_me", 1, {
  doc: `Represents the possessive determiner when referring to the current actor.`
});
def_property("possessive_pronoun_if_me", 1, {
  doc: `Represents the possessive pronoun when referring to the current actor.`
});
def_property("reflexive_pronoun_if_me", 1, {
  doc: `Represents the reflexive pronoun when referring to the current actor.`
});

world.subject_pronoun_if_me.add_method({
  name: "person",
  when: (x) => world.is_a(x, "person"),
  handle: (x) => "you"
});
world.object_pronoun_if_me.add_method({
  name: "person",
  when: (x) => world.is_a(x, "person"),
  handle: (x) => "you"
});
world.possessive_determiner_if_me.add_method({
  name: "person",
  when: (x) => world.is_a(x, "person"),
  handle: (x) => "your"
});
world.possessive_pronoun_if_me.add_method({
  name: "person",
  when: (x) => world.is_a(x, "person"),
  handle: (x) => "yours"
});
world.reflexive_pronoun_if_me.add_method({
  name: "person",
  when: (x) => world.is_a(x, "person"),
  handle: (x) => "yourself"
});

world.contributes_light.add_method({
  name: "possessions can light person",
  when: (x) => world.is_a(x, "person") && world.contents(x).some(o => world.contributes_light(o)),
  handle: (x) => true
});

/*** NPCs ***/

// skipping them for now

/*** Backdrop ***/

def_property("backdrop_locations", 1, {
  doc: `A list of rooms or regions in which the backdrop can be seen.`
});
world.backdrop_locations.add_method({
  name: "backdrop default",
  when: (x) => world.is_a(x, "backdrop"),
  handle: (x) => []
});

def_activity("move_backdrops", {
  doc: `Updates the locations of backdrops given a current location.`
});
world.move_backdrops.add_method({
  name: "moves all relevant backdrops to the current location.",
  handle: function (curr_loc) {
    world.all_of_kind("backdrop").forEach(backdrop => {
      var locations = world.backdrop_locations(backdrop);
      if (locations === "everywhere") {
        world.put_in(backdrop, curr_loc);
      } else {
        var move = false;
        locations.forEach(loc => {
          if (loc === curr_loc || world.contains(loc, curr_loc)) {
            // second condition for handling regions
            move = true;
          }
        });
        if (move) {
          world.put_in(backdrop, curr_loc);
        }
      }
    });
  }
});

/*** Scenery ***/

def_property("is_scenery", 1, {
  doc: `Scenery refers to things which are fixed in place and not referred to in room descriptions.`
});
world.is_scenery.add_method({
  name: "things not default scenery",
  when: (x) => world.is_a(x, "thing"),
  handle: (x) => false
});
world.is_scenery.add_method({
  name: "backdrops are scenery",
  when: (x) => world.is_a(x, "backdrop"),
  handle: (x) => true
});

world.fixed_in_place.add_method({
  name: "scenery is fixed in place",
  when: (x) => world.is_a(x, "thing") && world.is_scenery(x),
  handle: (x) => true
});

world.reported.add_method({
  name: "scenery is not reported",
  when: (x) => world.is_a(x, "thing") && world.is_scenery(x),
  handle: (x) => false
});

/*** Other properties ***/

def_property("switchable", 1, {
  doc: `Represents whether a thing can be switched on and off.`
});
world.switchable.add_method({
  name: "things not switchable by default",
  when: (x) => world.is_a(x, "thing"),
  handle: (x) => false
});

def_property("is_switched_on", 1, {
  doc: `Represents whether a device is currently switched on.`
});
world.is_switched_on.add_method({
  name: "switchable things not default switched on",
  when: (x) => world.switchable(x),
  handle: (x) => false
});

def_property("is_switched_on_msg", 1, {
  doc: `A string representing the switched_on property.`
});
world.is_switched_on_msg.add_method({
  name: "switchable is off",
  when: (x) => world.switchable(x) && !world.is_switched_on(x),
  handle: (x) => "off"
});
world.is_switched_on_msg.add_method({
  name: "switchable is on",
  when: (x) => world.switchable(x) && world.is_switched_on(x),
  handle: (x) => "on"
});

def_property("no_switch_msg", 2, {
  doc: `Represents the messages for not being able to switch on or off an object.`
});
world.no_switch_msg.add_method({
  name: "no_switch default",
  when: (o, type) => type === "no_switch",
  handle: (o, type) => `{Bob} can't switch that.`
});
world.no_switch_msg.add_method({
  name: "no_switch_on default",
  when: (o, type) => type === "no_switch_on",
  handle: (o, type) => `{Bob} can't switch that on.`
});
world.no_switch_msg.add_method({
  name: "no_switch_off default",
  when: (o, type) => type === "no_switch_off",
  handle: (o, type) => `{Bob} can't switch that off.`
});
world.no_switch_msg.add_method({
  name: "already_on default",
  when: (o, type) => type === "already_on",
  handle: (o, type) => "That's already switched on."
});
world.no_switch_msg.add_method({
  name: "already_off default",
  when: (o, type) => type === "already_off",
  handle: (o, type) => "That's already switched off."
});

/*** HTML out ***/

/** The out variable contains the current HTML output object. It is the "standard out" for the game. */
var out;

/** String utility functions */
var str_util = {};

str_util.cap = function (s) {
  /* Capitalize the first letter of the string. */
  return s.charAt(0).toUpperCase() + s.slice(1);
};
str_util.serial_comma = function(nouns, {conj="and", comma=",", force_comma=false}={}) {
  if (nouns.length === 0) {
    return "nothing";
  } else if (nouns.length === 1) {
    return nouns[0];
  } else if (nouns.length === 2) {
    if (force_comma) {
      return nouns[0] + comma + " " + conj + " " + nouns[1];
    } else {
      return nouns[0] + " " + conj + " " + nouns[1];
    }
  } else {
    return nouns.slice(0, nouns.length-1).join(comma + " ") + comma + " " + conj + " " + nouns[nouns.length-1];
  }
};
str_util.is_are_list = function (nouns, opts={}) {
  if (nouns.length === 0) {
    return "is nothing";
  } else if (nouns.length === 1) {
    return "is " + nouns[0];
  } else {
    return "are " + str_util.serial_comma(nouns, opts);
  }
};

class HTML_abstract_builder {
  constructor(old_out, root) {
    this.old_out = old_out;
    this.root = root;
  }
  add_class(cls) {
    this.root.classList.add(cls);
  }
  css(k, v) {
    this.root.style[k] = v;
  }
  attr(k, v) {
    this.root.setAttribute(k, v);
  }
  on(event, handler, useCapture) {
    event.split(' ').forEach(e => {
      if (e !== '') {
        this.root.addEventListener(e, handler, !!useCapture);
      }
    });
  }
  wrap_action_link(action, f) {
    out.enter_inline("a");
    out.attr("href", "");
    out.add_class("action");
    out.on("click", (e) => {
      e.preventDefault();
      console.log("clicked! for action: " + action);
    });
    try {
      f();
    } finally {
      out.leave();
    }
  }
  wrap_examine(o, f) {
    out.wrap_action_link("examine " + world.name(o), f);
  }

  ob(o, text) {
    /* Takes an object and possibly some text and provides a link to examine that object. */
    out.wrap_examine(o, () => {
      if (arguments.length === 2) {
        out.write_text(text);
      } else {
        out.write_text(world.name(o));
      }
    });
  }

  action(act, text) {
    /* Takes an action and possibly some text and provides a link to do that action. */
    out.wrap_action_link(act, () => {
      out.write_text(text || act);
    });
  }

  dir(dir, text) {
    /* Takes direction and possibly some text and provides a link to go in that direction */
    out.wrap_action_link("go " + dir, () => {
      out.write_text(text || dir);
    });
  }

  look(dir, text) {
    /* Takes direction and possibly some text and provides a link to look in that direction */
    out.wrap_action_link("look " + dir, () => {
      out.write_text("\u2686 " + (text || dir));
    });
  }

  goto(room, text) {
    /* Takes room and possibly some text and provides a link to go to that room */
    out.wrap_action_link("go to " + room, () => {
      out.write_text(text || world.name(room));
    });
  }

  the_(o) { out.write_text(world.definite_name(o)); }
  the(o) { out.wrap_examine(o, () => out.the_(o)); }
  The_(o) { out.write_text(str_util.cap(world.definite_name(o))); }
  The(o) { out.wrap_examine(o, () => out.The_(o)); }
  a(o) { out.wrap_examine(o, () => out.write_text(world.indefinite_name(o))); }
  A(o) { out.wrap_examine(o, () => out.write_text(str_util.cap(world.indefinite_name(o)))); }
  he(o) { out.wrap_examine(o, () => out.write_text(world.subject_pronoun(o))); }
  He(o) { out.wrap_examine(o, () => out.write_text(str_util.cap(world.subject_pronoun(o)))); }
  him(o) { out.wrap_examine(o, () => out.write_text(world.object_pronoun(o))); }
  Him(o) { out.wrap_examine(o, () => out.write_text(str_util.cap(world.object_pronoun(o)))); }

  serial_comma(objs, {conj="and", comma=",", force_comma=false}={}) {
    /* Concatenates a indefinite names of a list of objects, using the serial comma. */
    if (objs.length === 0) {
      out.write_text("nothing");
    } else if (objs.length === 1) {
      out.a(objs[0]);
    } else if (objs.length === 2) {
      if (force_comma) {
        out.a(objs[0]);
        out.write_text(comma + " " + conj + " ");
        out.a(objs[1]);
      } else {
        out.a(objs[0]);
        out.write_text(" " + conj + " ");
        out.a(objs[1]);
      }
    } else {
      for (var i = 0; i < objs.length; i++) {
        if (i == objs.length - 1) {
          out.write_text(comma + " " + conj + " ");
        } else if (i > 0) {
          out.write_text(comma + " ");
        }
        out.a(objs[i]);
      }
    }
  }

  is_are_list(objs, opts={}) {
    if (objs.length === 0) {
      out.write_text("is nothing");
    } else if (objs.length === 1) {
      out.write_text("is ");
      out.a(objs[0]);
    } else {
      out.write_text("are ");
      out.serial_comma(objs, opts);
    }
  }

  write(s) {
    /* Takes a string and expands phrases in square brackets by calling the corresponding
       'out' method --- all other text is written using 'out.write_text'.

       out.write("You see [a ball] and [the 'red apple'].") is equivalent to
       out.write_text("You see "); out.a("ball"); out.write_text(" and "); out.the("red apple"); out.write_text(".")

       The notation "{foo|bar|baz}" is syntactic sugar for "[reword foo bar baz]", which is for
       convenient verb conjugation and such.
    */

    var i = 0, j = 0;
    while (j < s.length) {
      if (s[j] === "[") {
        if (i < j) {
          out.write_text(s.slice(i, j));
        }
        j++;
        var parts = [];
        while (j < s.length && s[j] !== ']') {
          if (s.charCodeAt(j) <= 32) {
            j++;
            continue;
          } else if (s[j] === "'" || s[j] === '"') {
            let q = s[j];
            i = ++j;
            while (j < s.length && s[j] !== q) {
              j++;
            }
            if (s[j] !== q) {
              throw new TypeError("unmatched quote");
            }
            parts.push(s.slice(i, j));
            j++;
          } else {
            i = j;
            while (j < s.length && s.charCodeAt(j) > 32 && s[j] !== "]") {
              j++;
            }
            parts.push(s.slice(i, j));
          }
        }
        if (j === s.length) {
          throw new TypeError("missing close ]");
        }
        i = ++j;
        let f = out[parts[0]];
        if (!f) {
          throw new Error("No such 'out' method named '"+parts[0]+"'");
        }
        f.apply(out, parts.slice(1));
      } else if (s[j] === "{") {
        if (i < j) {
          out.write_text(s.slice(i, j));
        }
        i = ++j;
        parts = [];
        while (j < s.length && s[j] !== "}") {
          if (s[j] === "|") {
            parts.push(s.slice(i, j));
            i = ++j;
          } else {
            j++;
          }
        }
        if (s[j] !== "}") {
          throw new TypeError("expecting closing '}'");
        }
        parts.push(s.slice(i, j));
        i = ++j;
        out.reword.apply(out, parts);
      } else {
        j++;
      }
    }
    if (i < s.length) {
      out.write_text(s.slice(i));
    }
  }

  reword(word, ...flags) {
    /*
      This command has the syntactic sugar {word|flag1|flag2|...} for [reword word flag1 flag2 ...].

      Rule: write everything as if there was some guy named Bob (who speaks in the third person)
      is doing the actions, and bracket every word that should change depending on context.
      We assume that if the actor of the  context did the action, it should be reported
      in the second person.

      flags:
      * obj - makes "bob" be the object of a sentence

      */

    var is_me = world.actor === world.player;
    var rewritten = out._reword(word.toLowerCase(), flags, world.actor, is_me);
    if (word[0].toLowerCase() === word[0]) {
      out.write_text(rewritten);
    } else {
      out.write_text(str_util.cap(rewritten));
    }
  }

  _reword(word, flags, actor, is_me) {
    if (is_me) {
      if (word === "we")
        return world.subject_pronoun_if_me(actor);
      else if (word === "us")
        return world.object_pronoun_if_me(actor);
      else if (word === "ourself" || word === "ourselves")
        return world.reflexive_pronoun_if_me(actor);
      else if (word === "bobs") {
        if (flags.includes("obj"))
          return world.object_pronoun_if_me(actor);
        else
          return world.subject_pronoun_if_me(actor);
      } else if (word === "our")
        return world.possessive_determiner_if_me(actor);
      else if (word === "ours")
        return world.possessive_pronoun_if_me(actor);
      else if (reword_replacements.has(word))
        return reword_replacements.get(word);
      else // we assume the word should stay as-is
        return word;
    } else {
      if (word === "we")
        return world.subject_pronoun(actor);
      else if (word === "us")
        return world.object_pronoun(actor);
      else if (word === "ourself" || word === "ourselves")
        return world.reflexive_pronoun(actor);
      else if (word === "bobs")
        return world.definite_name(actor);
      else if (word === "our")
        return world.possessive_determiner(actor);
      else if (word === "ours")
        return world.possessive_pronoun(actor);
      else if (word.length > 1 && word.slice(-1) === "y")
        return word.slice(0, -1) + "ies";
      else
        return word + "s";
    }
  }
}

/* These are for going from 3rd person to 2nd person.  They are
   exceptions to the rule that 2nd person to 3rd person adds an 's' to
   the end.  These are fine to be global because English language
   shouldn't change between games. */
var reword_replacements = new Map;
reword_replacements.set("is", "are");
reword_replacements.set("has", "have");
reword_replacements.set("hasn't", "haven't");
reword_replacements.set("does", "do");
reword_replacements.set("doesn't", "don't");
reword_replacements.set("can", "can");
reword_replacements.set("can't", "can't");
reword_replacements.set("switches", "switch");
reword_replacements.set("isn't", "aren't");


class HTML_para_builder extends HTML_abstract_builder {
  constructor(old_out, root) {
    super(old_out, root);
    this._para = null;
  }
  leave() {
    if (this.old_out === null) {
      throw new Error("This is the root HTML builder");
    }
    this.para();
    out = this.old_out;
  }
  ensure_para() {
    if (!this._para) {
      this._para = document.createElement("p");
      this.root.appendChild(this._para);
    }
  }
  para() {
    /* create a new paragraph (by closing the current one) */
    if (this._para) {
      this._para = null;
    }
  }
  write_text(s) {
    if (typeof s !== "string") {
      throw new TypeError("expecting string");
    }
    this.ensure_para();
    this._para.appendChild(document.createTextNode(s));
  }
  write_element(e) {
    if (!(e instanceof Element)) {
      throw new TypeError("expecting element");
    }
    this.ensure_para();
    this._para.appendChild(e);
  }
  enter_inline(tagname) {
    this.ensure_para();
    var e = document.createElement(tagname);
    this._para.appendChild(e);
    out = new HTML_inline_builder(this, e);
  }
  enter_block(tagname) {
    this.para();
    var e = document.createElement(tagname);
    this.root.appendChild(e);
    out = new HTML_block_builder(this, e);
  }
}

class HTML_inline_builder extends HTML_abstract_builder {
  constructor(old_out, root) {
    super(old_out, root);
  }
  leave() {
    if (this.old_out === null) {
      throw new Error("This is the root HTML builder");
    }
    out = this.old_out;
  }
  write_text(s) {
    if (typeof s !== "string") {
      throw new TypeError("expecting string");
    }
    this.root.appendChild(document.createTextNode(s));
  }
  write_element(e) {
    if (!(e instanceof Element)) {
      throw new TypeError("expecting element");
    }
    this.root.appendChild(e);
  }
  enter_inline(tagname) {
    var e = document.createElement(tagname);
    this.root.appendChild(e);
    out = new HTML_inline_builder(this, e);
  }
}

class HTML_block_builder extends HTML_abstract_builder {
  constructor(old_out, root) {
    super(old_out, root);
  }
  leave() {
    if (this.old_out === null) {
      throw new Error("This is the root HTML builder");
    }
    out = this.old_out;
  }
  write_text(s) {
    if (typeof s !== "string") {
      throw new TypeError("expecting string");
    }
    this.root.appendChild(document.createTextNode(s));
  }
  write_element(e) {
    if (!(e instanceof Element)) {
      throw new TypeError("expecting element");
    }
    this.root.appendChild(e);
  }
  enter_inline(tagname) {
    var e = document.createElement(tagname);
    this.root.appendChild(e);
    out = new HTML_inline_builder(this, e);
  }
  enter_block(tagname) {
    var e = document.createElement(tagname);
    this.root.appendChild(e);
    out = new HTML_block_builder(this, e);
  }
  enter_paras() {
    out = new HTML_para_builder(out, this.root);
  }
}

function init_output(root_id) {
  var root = document.getElementById(root_id);
  if (!root) {
    throw new Error("No element with id " + root_id);
  }
  out = new HTML_para_builder(null, root);
}

/*** Activities for describing the world ***/

def_activity("describe_direction", {
  doc: "Write out the direction_description of the visible_container of the actor."
});
world.describe_direction.add_method({
  name: "default",
  handle: function (dir) {
    var loc = world.visible_container(world.actor);
    var desc = world.direction_description(loc, dir);
    if (typeof desc === "string") {
      out.write(desc);
    }
  }
});

def_activity("terse_obj_description", {
  doc: `Should give a terse description of an object while modifying 'mentioned' as objects
are mentioned.`
});
world.terse_obj_description.add_method({
  name: "default",
  handle: function (o, notables, mentioned) {
    mentioned.add(o);
    var d = world.notable_description(o);
    if (typeof d === "string") {
      out.write(d);
    } else if (d === false) {
      out.a(o);
    }
  }
});
world.terse_obj_description.add_method({
  name: "containers",
  when: (o, notables, mentioned) => world.is_a(o, "container"),
  handle: function (o, notables, mentioned) {
    if (world.is_opaque(o) && world.openable(o) && !world.is_open(o)) {
      this.next();
      out.write(" (which is closed)");
    }
  }
});
