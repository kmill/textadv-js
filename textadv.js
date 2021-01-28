// textadv.js
// A simple engine for interactive fiction.
// (c) 2021 Kyle Miller

"use strict";

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
        throw new TypeError(name + " expecting " + arity + " arguments");
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

def_property("global", 1, {
  name: "Global variables.  Infrequently used."
});

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
one of five things: contained_by, owned_by, part_of, worn_by`
});

def_activity("put_in", {
  doc: "make something be contained by something.  This should be used for containers, supporters, and rooms."
});
world.put_in.add_method({
  name: "default",
  handle: function (obj, container) {
    world.location.relate(obj, container, "contained_by");
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
  doc: `Given two objects, determine whether the first object transitively contains
(via the location) the second.  An object does not contain itself.`
});
world.contains.add_method({
  name: "default",
  handle: function (o1, o2) {
    o2 = world.location(o2);
    for (; o2; o2 = world.location(o2)) {
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
    if (options.via) {
      world.connect_rooms(room1, dir, options.via);
      world.connect_rooms(options.via, dir, room2);
      return;
    }
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
      if (!world[key]) {
        throw new TypeError("No such property named " + key);
      }
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

def_property("uncountable", 1, {
  doc: `Represents whether the object is an uncountable noun.`
});
world.uncountable.add_method({
  name: "default",
  when: (x) => world.kind(x),
  handle: (x) => false
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
    } else if (world.uncountable(x)) {
      return "some " + world.printed_name(x);
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
    } else if (world.uncountable(x)) {
      return "some " + printed_name;
    } else if (printed_name.match(/^[aeiou]/i)) {
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
but not "ball red").  All words should be lower case.`
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
    var words = world.name(x).toLowerCase().split(" ");
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
  when: (x, person) => world.is_a(x, "room") && world.is_a(person, "person"),
  handle: (x, person) => false
});

def_property("known", 2, {
  doc: `Represents whether something is known to someone.`
});
function make_known(obj, /*opt*/actor) {
  /* A utility function to make an object known.  Returns the object. */
  if (!actor) {
    actor = world.actor;
  }
  world.known.set(obj, actor, true);
  return obj;
}
world.known.add_method({
  name: "default",
  handle: (x, person) => false
});
world.known.add_method({
  name: "room visited",
  when: (x, person) => world.is_a(x, "room") && world.is_a(person, "person"),
  handle: (x, person) => world.visited(x, person)
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
  handle: (x, dir) => `{Bobs} {can't} go that way.`
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
If it is set to null, then it is taken to mean there is no such paragraph.`
});
world.notable_description.add_method({
  name: "default",
  handle: (x) => null
});

def_property("reported", 1, {
  doc: `Represents whether the object should be automatically reported in room descriptions.`
});
world.reported.add_method({
  name: "default",
  handle: (x) => false
});
world.reported.add_method({
  name: "default thing",
  when: (x) => world.is_a(x, "thing"),
  handle: (x) => true
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
world.accessible_to.add_method({
  name: "accessible if it's in location chain of actor",
  handle: function (x, actor) {
    /* This helps prevents accidentally trapping oneself inside something without light. */
    var loc = world.location(actor);
    while (loc && world.is_a(loc, "thing")) {
      if (loc === x) {
        return true;
      }
      if (world.openable(loc) && !world.is_open(loc)) {
        break;
      }
      loc = world.location(loc);
    }
    return this.next();
  }
});

def_property("is_opaque", 1, {
  doc: `Represents whether the object cannot transmit light.`
});
world.is_opaque.add_method({
  name: "default opaque",
  when: (x) => world.is_a(x, "thing"),
  handle: (x) => true
});

def_property("enterable", 1, {
  doc: `Is true if the object is something someone could enter.`
});
world.enterable.add_method({
  name: "default",
  when: (x) => world.is_a(x, "thing"),
  handle: (x) => false
});

def_property("no_enter_msg", 1, {
  doc: `Gives a message for why one is unable to enter the object (when enterable is not true).`
});
world.no_enter_msg.add_method({
  name: "default",
  when: (x) => world.is_a(x, "thing"),
  handle: (x) => `{Bobs} {can't} enter that.`
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
      if (world.enterable(loc)) {
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
  when: (x) => world.enterable(x),
  handle: (x) => null
});

def_property("wearable", 1, {
  doc: `Represents whether something could be worn by a person.`
});
world.wearable.add_method({
  doc: "default",
  when: (x) => world.is_a(x, "thing"),
  handle: (x) => false
});

def_property("edible", 1, {
  doc: `Represents whether something could be eaten.`
});
world.edible.add_method({
  doc: "default",
  when: (x) => world.is_a(x, "thing"),
  handle: (x) => false
});

/*** doors ***/

world.put_in.add_method({
  name: "not for doors",
  when: (x) => world.kind(x) && world.is_a(x, "door"),
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
  handle: (o, type) => `That doesn't appear to be lockable.`
});
world.no_lock_msg.add_method({
  name: "no_unlock default",
  when: (o, type) => type === "no_unlock",
  handle: (o, type) => `That doesn't appear to be unlockable.`
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
  when: (x) => world.is_a(x, "container") && (world.is_opaque(x) || (world.openable(x) && !world.is_open(x))),
  handle: (x) => x
});

/*** Supporter ***/

world.contents.add_method({
  name: "supporter default",
  when: (x) => world.is_a(x, "supporter"),
  handle: (x) => world.location.related_to(x, "contained_by")
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
  handle: (o, type) => `{Bobs} can't switch that.`
});
world.no_switch_msg.add_method({
  name: "no_switch_on default",
  when: (o, type) => type === "no_switch_on",
  handle: (o, type) => `{Bobs} can't switch that on.`
});
world.no_switch_msg.add_method({
  name: "no_switch_off default",
  when: (o, type) => type === "no_switch_off",
  handle: (o, type) => `{Bobs} can't switch that off.`
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
var suppress_action_links = false;

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

  with_block(tag, f) {
    out.enter_block(tag);
    try {
      f();
    } finally {
      out.leave();
    }
  }
  with_inline(tag, f) {
    out.enter_inline(tag);
    try {
      f();
    } finally {
      out.leave();
    }
  }
  
  wrap_action_link(action, f) {
    if (suppress_action_links) {
      out.enter_inline("span");
    } else {
      out.enter_inline("a");
      out.attr("href", "");
      out.add_class("action");
      out.attr("data-action", action);
    }
    try {
      f();
    } finally {
      out.leave();
    }
  }
  wrap_examine(o, f) {
    out.wrap_action_link("examine " + world.name(o), f);
  }

  without_action_links(f) {
    suppress_action_links = true;
    try {
      f();
    } finally {
      suppress_action_links = false;
    }
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

  the_(o) { make_known(o); out.write_text(world.definite_name(o)); }
  the(o) { out.wrap_examine(o, () => out.the_(o)); }
  The_(o) { make_known(o); out.write_text(str_util.cap(world.definite_name(o))); }
  The(o) { out.wrap_examine(o, () => out.The_(o)); }
  a(o) { make_known(o); out.wrap_examine(o, () => out.write_text(world.indefinite_name(o))); }
  A(o) { make_known(o); out.wrap_examine(o, () => out.write_text(str_util.cap(world.indefinite_name(o)))); }
  we(o) { make_known(o); out.wrap_examine(o, () => out.write_text(world.subject_pronoun(o))); }
  We(o) { make_known(o); out.wrap_examine(o, () => out.write_text(str_util.cap(world.subject_pronoun(o)))); }
  us(o) { make_known(o); out.wrap_examine(o, () => out.write_text(world.object_pronoun(o))); }
  Us(o) { make_known(o); out.wrap_examine(o, () => out.write_text(str_util.cap(world.object_pronoun(o)))); }

  serial_comma(objs, {conj="and", comma=",", force_comma=false}={}) {
    /* Concatenates a list of writers, using the serial comma.  The objs can either be functions
       that write, or be strings that will be written with `out.a`. */
    function handle(f) {
      if (typeof f === "string") {
        out.a(f);
      } else {
        f();
      }
    }
    if (objs.length === 0) {
      out.write_text("nothing");
    } else if (objs.length === 1) {
      handle(objs[0]);
    } else if (objs.length === 2) {
      if (force_comma) {
        handle(objs[0]);
        out.write_text(comma + " " + conj + " ");
        handle(objs[1]);
      } else {
        handle(objs[0]);
        out.write_text(" " + conj + " ");
        handle(objs[1]);
      }
    } else {
      for (var i = 0; i < objs.length; i++) {
        if (i == objs.length - 1) {
          out.write_text(comma + " " + conj + " ");
        } else if (i > 0) {
          out.write_text(comma + " ");
        }
        handle(objs[i]);
      }
    }
  }

  is_are_list(objs, opts={}) {
    /* Prefixes `serial_comma` with `is` or `are` depending on the length of the first argument. */
    if (objs.length === 0 || objs.length === 1) {
      out.write_text("is ");
    } else {
      out.write_text("are ");
    }
    out.serial_comma(objs, opts);
  }

  write(s /* or more arguments */) {
    /* Takes a string and expands phrases in square brackets by calling the corresponding
       'out' method --- all other text is written using 'out.write_text'.

       out.write("You see [a ball] and [the 'red apple'].") is equivalent to
       out.write_text("You see "); out.a("ball"); out.write_text(" and "); out.the("red apple"); out.write_text(".")

       The notation "{foo|bar|baz}" is syntactic sugar for "[reword foo bar baz]", which is for
       convenient verb conjugation and such.

       If s is falsy (for example null, false, or undefined), then returns immediately.
       If s is a function, then that function is evaluated instead.
    */
    if (arguments.length > 1) {
      for (let i = 0; i < arguments.length; i++) {
        out.write(arguments[i]);
      }
      return;
    }

    if (!s) {
      return;
    }
    if (typeof s === "function") {
      s();
      return;
    }

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
      else if (reword_replacements.has(word))
        return reword_replacements.get(word);
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
reword_replacements.set("are", "is");
reword_replacements.set("have", "has");
reword_replacements.set("haven't", "hasn't");
reword_replacements.set("do", "does");
reword_replacements.set("don't", "doesn't");
reword_replacements.set("can", "can");
reword_replacements.set("can't", "can't");
reword_replacements.set("switch", "switches");
reword_replacements.set("aren't", "isn't");

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
    out.write(world.direction_description(loc, dir));
  }
});

def_activity("terse_obj_description", {
  doc: `Should give a terse description of an object while modifying 'mentioned' as objects
are mentioned. Either writes its own description, or returns something that could be given
to out.write to result in something that fits in another sentence.`
});
world.terse_obj_description.add_method({
  name: "default",
  handle: function (o, notables, mentioned) {
    mentioned.add(o);
    var d = world.notable_description(o);
    if (d === null) {
      return () => out.a(o);
    } else {
      out.write(d);
      return null;
    }
  }
});
world.terse_obj_description.add_method({
  name: "containers",
  when: (o, notables, mentioned) => world.is_a(o, "container"),
  handle: function (o, notables, mentioned) {
    let td = this.next();
    if (!td) {
      return null;
    }
    if (world.is_opaque(o) && world.openable(o) && !world.is_open(o)) {
      return () => {
        out.write(td);
        out.write(" (which is closed)");
      };
    } else {
      var contents = world.contents(o);
      var msgs = [];
      contents.forEach(c => {
        if (notables.includes(c) && !mentioned.has(c)) {
          var msg = world.terse_obj_description(c, notables, mentioned);
          if (msg) {
            msgs.push(msg);
          }
        }
      });
      if (msgs.length) {
        var state = "";
        if (world.openable(o) && !world.is_open(o)) {
          state = "which is " + world.is_open_msg(o) + " and ";
        }
        return () => {
          out.write(td, " (" + state + "in which ");
          out.is_are_list(msgs);
          out.write(")");
        };
      } else if (contents.length === 0) {
        return () => {
          out.write(td, " (which is empty)");
        };
      }
    }
    return td;
  }
});
world.terse_obj_description.add_method({
  name: "supporters",
  when: (o, notables, mentioned) => world.is_a(o, "supporter"),
  handle: function (o, notables, mentioned) {
    let td = this.next();
    if (!td) {
      return null;
    }
    var contents = world.contents(o);
    var msgs = [];
    contents.forEach(c => {
      if (notables.includes(c) && !mentioned.has(c)) {
        var msg = world.terse_obj_description(c, notables, mentioned);
        if (msg) {
          msgs.push(msg);
        }
      }
    });
    if (msgs.length) {
      return () => {
        out.write(td);
        out.write(" (on which ");
        out.is_are_list(msgs);
        out.write(")");
      };
    } else {
      return td;
    }
  }
});

//// describe_object

def_activity("describe_object", {
  doc: `gives the description of an object, in the context of examining it.`
});
world.describe_object.add_method({
  name: "init state",
  handle: function (o) {
    /* Hack: this is a global variable that is set to true if
       anything has described this object.  Used in the 'default' handler. */
    world.describe_object.described = false;
  }
});
world.describe_object.add_method({
  name: "description",
  handle: function (o) {
    this.next();
    var d = world.description(o);
    if (d !== null || typeof d === "string") {
      world.describe_object.described = true;
      out.write(d);
    }
  }
});
world.describe_object.add_method({
  name: "container",
  when: (o) => world.is_a(o, "container") && !world.suppress_content_description(o),
  handle: function (o) {
    this.next();
    if (!world.is_opaque(o)) {
      var contents = world.contents(o).filter(c => c !== world.actor && world.reported(c));
      if (contents.length > 0) {
        if (world.describe_object.described) {
          out.para();
        }
        world.describe_object.described = true;
        out.write("In "); out.the(o); out.write(" ");
        out.is_are_list(contents.map(c => () => out.a(c)));
        out.write(".");
      }
    } else if (world.openable(o) && !world.is_open(o)) {
      if (world.describe_object.described) {
        out.para();
      }
      world.describe_object.described = true;
      out.The(o); out.write(" is closed.");
    }
  }
});
world.describe_object.add_method({
  name: "supporter",
  when: (o) => world.is_a(o, "supporter") && !world.suppress_content_description(o),
  handle: function (o) {
    this.next();
    var contents = world.contents(o).filter(c => c !== world.actor && world.reported(c));
    if (contents.length > 0) {
      if (world.describe_object.described) {
        out.para();
      }
      world.describe_object.described = true;
      out.write("On "); out.the(o); out.write(" ");
      out.is_are_list(contents.map(c => () => out.a(c)));
      out.write(".");
    }
  }
});
world.describe_object.add_method({
  name: "switchable",
  when: (o) => world.switchable(o),
  handle: function (o) {
    this.next();
    if (world.describe_object.described) {
      out.para();
    }
    world.describe_object.described = true;
    out.write(str_util.cap(world.subject_pronoun(o)), " is currently switched ");
    out.write(world.is_switched_on_msg(o)); out.write(".");
  }
});
world.describe_object.add_method({
  name: "default",
  handle: function (o) {
    this.next();
    if (!world.describe_object.described) {
      out.write("{Bobs} {see} nothing special about "); out.the(o); out.write(".");
    }
  }
});

//// describe_contents and describe_content

def_activity("describe_content", {
  doc: `Describe an object like in an inventory listing.  Assumes 'out' is currently in a list element (li or ol).`
});
world.describe_content.add_method({
  name: "indefinite name",
  handle: function (o) {
    out.a(o);
  }
});
world.describe_content.add_method({
  name: "worn",
  when: (o) => world.location.is_related(o, "worn_by"),
  handle: function (o) {
    this.next();
    out.write_text(" (worn)");
  }
});
world.describe_content.add_method({
  name: "openable",
  when: (o) => world.openable(o),
  handle: function (o) {
    this.next();
    out.write_text(" (" + world.is_open_msg(o) + ")");
  }
});
world.describe_content.add_method({
  name: "container",
  when: (o) => world.is_a(o, "container") && !world.is_opaque(o),
  handle: function (o) {
    this.next();
    out.with_block("ul", () => {
      world.contents(o).forEach(c => {
        out.with_block("li", () => {
          world.describe_content(c);
        });
      });
    });
  }
});
world.describe_content.add_method({
  name: "supporter",
  when: (o) => world.is_a(o, "supporter"),
  handle: function (o) {
    this.next();
    out.with_block("ul", () => {
      world.contents(o).forEach(c => {
        out.with_block("li", () => {
          world.describe_content(c);
        });
      });
    });
  }
});

def_activity("describe_contents", {
  doc: `Describe all contents like an inventory listing.  Uses describe_content`
});
world.describe_contents.add_method({
  name: "default",
  handle: function (o) {
    out.with_block("ul", () => {
      world.contents(o).forEach(c => {
        out.with_block("li", () => {
          world.describe_content(c);
        });
      });
    });
  }
});

//// notable objects

def_activity("get_notable_objects", {
  doc: `Returns a list of objects that are notable in a description as {o,n} pairs,
where n is a numeric value from 0 onward denoting notability. n=1 is default, and
n=0 disables.  Repeats are fine.`
});
world.get_notable_objects.add_method({
  name: "default",
  handle: (o) => []
});
world.get_notable_objects.add_method({
  name: "thing",
  when: (o) => world.is_a(o, "thing"),
  handle: function (o) {
    /* things are just notable enough to be mentioned. */
    var nobjs = this.next();
    nobjs.push({o: o, n: 1});
    return nobjs;
  }
});
world.get_notable_objects.add_method({
  name: "container",
  when: (o) => world.is_a(o, "container"),
  handle: function (o) {
    var nobjs = this.next();
    world.contents(o).forEach(c => {
      if (world.visible_to(c, world.actor)) {
        nobjs = nobjs.concat(world.get_notable_objects(c));
      }
    });
    return nobjs;
  }
});
world.get_notable_objects.add_method({
  name: "supporter",
  when: (o) => world.is_a(o, "supporter"),
  handle: function (o) {
    var nobjs = this.next();
    world.contents(o).forEach(c => {
      nobjs = nobjs.concat(world.get_notable_objects(c));
    });
    return nobjs;
  }
});
world.get_notable_objects.add_method({
  name: "not reported",
  when: (o) => !world.reported(o),
  handle: function (o) {
    return [{o: o, n: 0}];
  }
});
world.get_notable_objects.add_method({
  name: "actor not reported",
  when: (o) => o === world.actor,
  handle: function (o) {
    return [{o: o, n: 0}];
  }
});

//// describe location

def_activity("describe_current_location", {
  doc: "Calls describe_location using the location and visible container of the current actor"
});
world.describe_current_location.add_method({
  name: "default",
  handle: function () {
    var loc = world.location(world.actor);
    if (!loc) {
      out.write("{Bobs} {are} nowhere.");
      return;
    }
    var vis_cont = world.visible_container(loc);
    world.describe_location.current_location = vis_cont;
    world.describe_location.current_described_location = vis_cont;
    world.describe_location(loc, vis_cont);
  }
});

def_activity("describe_location_heading", {
  doc: "describe_location_heading(loc, vis_cont) gives the header for the location situated within the visible container"
});
world.describe_location_heading.add_method({
  name: "default",
  when: (loc, vis_cont) => loc === vis_cont,
  handle: function (loc, vis_cont) {
    world.describe_location.mentioned.add(loc);
    if (world.is_a(vis_cont, "thing")) {
      // Create an examine link for things
      out.The(vis_cont);
    } else {
      // Don't create a link for non-things.
      out.write(world.definite_name(vis_cont));
    }
  }
});
world.describe_location_heading.add_method({
  name: "default within vis_loc",
  when: (loc, vis_cont) => loc !== vis_cont,
  handle: function (loc, vis_cont) {
    world.describe_location.mentioned.add(loc);
    world.describe_location_heading(world.parent_enterable(loc), vis_cont);
  }
});
world.describe_location_heading.add_method({
  name: "container within vis_loc",
  when: (loc, vis_cont) => world.is_a(loc, "container") && loc !== vis_cont,
  handle: function (loc, vis_cont) {
    world.describe_location.mentioned.add(loc);
    world.describe_location_heading(world.parent_enterable(loc), vis_cont);
    out.write(" (in "); out.the(loc); out.write(")");
  }
});
world.describe_location_heading.add_method({
  name: "supporter within vis_loc",
  when: (loc, vis_cont) => world.is_a(loc, "supporter") && loc !== vis_cont,
  handle: function (loc, vis_cont) {
    world.describe_location.mentioned.add(loc);
    world.describe_location_heading(world.parent_enterable(loc), vis_cont);
    out.write(" (on "); out.the(loc); out.write(")");
  }
});

def_activity("describe_location", {
  doc: "describe_location(loc, vis_cont) describes the location situated within the visible container"
});
world.describe_location.add_method({
  name: "initialize",
  handle: function (loc, vis_cont) {
//    world.describe_location.notables = [];
    world.describe_location.mentioned = new Set;
  }
});
world.describe_location.add_method({
  name: "heading",
  handle: function (loc, vis_cont) {
    this.next();
    world.describe_location.currently_lit = true;
    out.with_block("div", () => {
      out.add_class("location_heading");
      world.describe_location_heading(loc, vis_cont);
    });
  }
});
world.describe_location.add_method({
  name: "description",
  handle: function (loc, vis_cont) {
    this.next();
    var do_desc = true;
    if (world.is_a(loc, "thing") && world.enterable(loc)) {
      /* It's possible it makes more sense to walk up the location chain until we hit
         a locale description, but I have no examples of this yet. */
      var loc_desc = world.locale_description(loc);
      if (loc_desc !== null) {
        out.write(loc_desc);
        do_desc = false;
      }
    }
    if (do_desc && world.is_a(vis_cont, "room")) {
      out.write(world.description(vis_cont));
    }
  }
});
world.describe_location.ascend_locations = true; // configuration
world.describe_location.add_method({
  name: "objects",
  handle: function (loc, vis_cont) {
    /* Prints descriptions of notable objects in the contents of the visible container. */
    this.next();
    var continue_ascending = true;
    var mentioned = world.describe_location.mentioned;
//    var notables = world.describe_location.notables;
    var ascend_locations = world.describe_location.ascend_locations;
    var curr_msgs = [];
    while (continue_ascending) {
      var raw_notables = [];
      world.contents(loc).forEach(o => {
        raw_notables = raw_notables.concat(world.get_notable_objects(o));
      });
      var to_ignore = raw_notables.filter(obj => obj.n === 0).map(obj => obj.o);
      var filtered_notables = raw_notables.filter(obj => !to_ignore.includes(obj.o));
      // Sort in reverse order of notability.
      filtered_notables.sort((obj1, obj2) => obj2.n - obj1.n);
      var notables = filtered_notables.map(obj => obj.o);

      var unnotable_messages = [];
      var current_location = null;
      // The top level prints first, unless we don't ascend.
      var is_first_sentence = (loc === vis_cont) || !ascend_locations;
      var current_start = null;
      var current_descs = [];
      notables.forEach(o => {
        if (mentioned.has(o))
          return;
        var msg = world.terse_obj_description(o, notables, mentioned);
        mentioned.add(o);
        if (!msg) // The object printed its own description.
          return;
        let o_loc;
        if (world.is_a(o, "door")) {
          // Doors have no locations; we assume it's in the vis_cont.
          o_loc = vis_cont;
        } else {
          o_loc = world.location(o);
        }
        if (o_loc !== current_location) {
          if (current_descs.length) {
            unnotable_messages.push({start: current_start, descs: current_descs});
            current_descs.length = 0;
          }
          current_location = o_loc;
          if (o_loc === vis_cont) {
            if (is_first_sentence) {
              current_start = "{Bobs} {see} ";
              is_first_sentence = false;
            } else {
              current_start = "{Bobs} also {see} ";
            }
          } else if (world.is_a(o_loc, "container")) {
            mentioned.add(o_loc);
            if (is_first_sentence) {
              current_start = () => {
                out.write("In "); out.the(o_loc); out.write(" {bobs} {see} ");
              };
              is_first_sentence = false;
            } else {
              current_start = () => {
                out.write("In "); out.the(o_loc); out.write(" {bobs} also {see} ");
              };
            }
          } else if (world.is_a(o_loc, "supporter")) {
            mentioned.add(o_loc);
            if (is_first_sentence) {
              current_start = () => {
                out.write("On "); out.the(o_loc); out.write(" {bobs} {see} ");
              };
              is_first_sentence = false;
            } else {
              current_start = () => {
                out.write("On "); out.the(o_loc); out.write(" {bobs} also {see} ");
              };
            }
          } else {
            throw new Error("Unknown kind of location for "+o_loc);
          }
        }
        current_descs.push(msg);
      });
      if (current_descs.length) {
        unnotable_messages.push({start: current_start, descs: current_descs});
      }
      if (unnotable_messages.length) {
        let umsgs = unnotable_messages;
        curr_msgs.unshift(() => {
          umsgs.forEach(m => {
            out.para();
            out.write(m.start);
            out.serial_comma(m.descs);
            out.write(".");
          });
        });
      }
      if ((loc === vis_cont) || !ascend_locations) {
        continue_ascending = false;
      } else {
        loc = world.location(loc);
      }
    }
    if (curr_msgs.length) {
      curr_msgs.forEach(m => {
        out.para();
        out.write(m);
      });
    }
  }
});
world.describe_location.add_method({
  name: "visit room",
  when: (loc, vis_cont) => world.is_a(vis_cont, "room"),
  handle: function (loc, vis_cont) {
    this.next();
    /* If the visible container is a room (and there's light) then we set it to being visited. */
    world.visited.set(vis_cont, world.actor, true);
  }
});
world.describe_location.add_method({
  name: "darkness",
  when: (loc, vis_cont) => !world.contains_light(vis_cont),
  handle: function (loc, vis_cont) {
    world.describe_location.currently_lit = true;
    out.with_block("div", () => {
      out.add_class("location_heading");
      out.write("Darkness");
    });
    out.write("[para]You can't see a thing; it's incredibly dark.");
  }
});

/*** Actions ***/

/*
Actions are commands that run to change the state of the world.  The action objects
are usually generated by the parser, and then to process an action there are a number
of generic functions associated to it.

* verify. Check if the action is reasonable.  If it isn't, the action fails.  This is
    by the parser for disambiguation, too.  It's still up to 'before' to verify if an action is possible.
* try_before. Tries to put the world in the right state to make 'before' succeed, for example
    automatically picking up objects.  One usually shouldn't add methods directly to this.
* before. Checks if the action is possible.  Might throw a do_instead exception to redirect execution.
    For example, it's logical to open a door, but it's not possible to open a locked one.
* carry_out. Actually carry out the action.  Must not fail.
* report. Report the action, unless the action was to be carried out silently.  Should
    not change world state.

*/

/** A table for all generic functions for all actions. */
var actions = {};

actions.verify = make_generic_function("verify", {
  doc: "Check how logical an action is.  Should not change world state."
});
actions.try_before = make_generic_function("try_before", {
  doc: "Tries to perform actions to make the action work."
});
actions.before = make_generic_function("before", {
  doc: "Checks an action to see whether it can be done."
});
actions.carry_out = make_generic_function("carry_out", {
  doc: "Carries out the action.  Must not fail."
});
actions.report = make_generic_function("report", {
  doc: "Explains what was carried out.  Should not change the world state."
});

actions.write_gerund_form = make_generic_function("write_gerund_form", {
  doc: "Given an action, write out the gerund form, like 'taking the ball'"
});
actions.write_infinitive_form = make_generic_function("write_infinitive_form", {
  doc: "Given an action, write out the infinitive form (without the 'to'), like 'take the ball'"
});

/* Common verbs in gerund form for the default `actions.gerund` handler. */
var gerunds_of_verbs = new Map;
var infinitives_of_verbs = new Map;
var particles_of_verbs = new Map;

function def_verb(verb, infinitive, gerund, particle=null) {
  infinitives_of_verbs.set(verb, infinitive);
  gerunds_of_verbs.set(verb, gerund);
  if (particle !== null) {
    particles_of_verbs.set(verb, particle);
  }
}

actions.gerund = make_generic_function("gerund", {
  doc: "Give the gerund for the given verb."
});
actions.gerund.add_method({
  name: "default",
  handle: (v) => gerunds_of_verbs.get(v)
});
actions.infinitive = make_generic_function("infinitive", {
  doc: "Give the infinitive for the given verb."
});
actions.infinitive.add_method({
  name: "default",
  handle: (v) => infinitives_of_verbs.get(v)
});
actions.particle = make_generic_function("particle", {
  doc: "Give the particle for the given verb."
});
actions.particle.add_method({
  name: "default",
  handle: (v) => particles_of_verbs.get(v)
});

actions.write_gerund_form.add_method({
  name: "default",
  handle: function (a) {
    out.write_text(actions.gerund(a.verb));
    if (a.dobj) {
      out.write_text(" ");
      out.the(a.dobj);
    }
    if (a.iobj) {
      out.write_text(" " + actions.particle(a.verb) + " ");
      out.the(a.iobj);
    }
  }
});

actions.write_infinitive_form.add_method({
  name: "default",
  handle: function (a) {
    out.write_text(actions.infinitive(a.verb));
    if (a.dobj) {
      out.write_text(" ");
      out.the(a.dobj);
    }
    if (a.iobj) {
      out.write_text(" " + actions.particle(a.verb) + " ");
      out.the(a.iobj);
    }
  }
});

actions.setup_action = make_generic_function("setup_action", {
  doc: `Some actions need additional fields to be set up.  This should tolerate being run
multiple times on the same action.`
});

const VERIFY_LOGICAL_CUTOFF = 90;

class verification {
  constructor(score, reason, not_visible=false) {
    this.score = score;
    this.reason = reason;
    /* For when the thing is illogical because it can't be seen.
       Meant to prevent unseemly disambiguations because of objects not
       presently viewable.  (Special cased in the parser.) */
    this.not_visible = not_visible;
  }
  is_reasonable() {
    return this.score >= VERIFY_LOGICAL_CUTOFF;
  }
  static join(v1, v2) {
    /* If both are reasonable, return the best; otherwise return the worst. */
    if (v1.is_reasonable() && v2.is_reasonable()) {
      if (v1.score >= v2.score)
        return v1;
      else
        return v2;
    } else {
      if (v1.score <= v2.score)
        return v1;
      else
        return v2;
    }
  }
}

function very_logical_action() {
  /* For actions which are particularly apt. */
  return new verification(150, "Very good.");
}
function logical_action() {
  /* For when the action is logical. */
  return new verification(100, "All good.");
}
function non_obvious_action() {
  /* To prevent automatically doing an operation. */
  return new verification(99, "Non-obvious.");
}
function barely_logical_action() {
  /* For when the action is barely logical because something else might
     be more logical; intended as a failsafe. */
  return new verification(90, "Almost not good.");
}
function illogical_already_action(reason) {
  /* For when the action is illogical because it's already been done. */
  return new verification(60, reason);
}
function illogical_inaccessible(reason) {
  /* For when the action is illogical because the object is inaccessible. */
  return new verification(20, reason);
}
function illogical_action(reason) {
  /* For illogical actions. */
  return new verification(10, reason);
}
function illogical_not_visible(reason) {
  /* For when the thing is illogical because it can't be seen. Helps prevent the
     disambiguator from mentioning non-visible objects. */
  return new verification(0, reason, true);
}

actions.verify.add_method({
  name: "default is that the action is barely logical.",
  handle: function (action) {
    return barely_logical_action();
  }
});
actions.try_before.add_method({
  name: "default is to do nothing.",
  handle: function (action) {
  }
});
actions.before.add_method({
  name: "default is to require nothing.",
  handle: function (action) {
  }
});
actions.carry_out.add_method({
  name: "default is to do nothing.",
  handle: function (action) {
  }
});
actions.report.add_method({
  name: "default is to say nothing.",
  handle: function (action) {
  }
});

class do_instead {
  /* A `before` event handler can raise this to abort the current action and instead do
     the action in the argument. */
  constructor(instead, suppress_message=false) {
    this.instead = instead;
    this.suppress_message = suppress_message;
  }
}

/** Adds a method to the before handler that raises `do_instead`.
Example:
```
instead_of(action => action.verb === "taking" && action.dobj = "ball",
           action => examining(action.dobj));
```
*/
function instead_of(when, new_action, suppress_message=false) {
  actions.before.add_method({
    name: "instead_of " + when,
    when: when,
    handle: function (action) {
      throw new do_instead(new_action(action), suppress_message);
    }
  });
}

class abort_action {
  /* Raised to signal that the action failed. */
  constructor(reason=null) {
    this.reason = reason;
  }
}

actions.run = make_generic_function("run", {
  doc: "Takes an action and performs it.  Takes some optional arguments."
});
actions.run.add_method({
  name: "default",
  handle: function (action, {is_implied=false, write_action=false, silently=false}={}) {
    if (write_action || is_implied) {
      if (write_action === true) {
        write_action = (s) => { out.write_text("("); out.write(s); out.write(")"); };
      }
      out.para();
      write_action(() => actions.write_gerund_form(action));
      out.para();
    }
    var reasonable = actions.verify(action);
    if (!reasonable.is_reasonable()) {
      throw new abort_action(reasonable.reason);
    }
    try {
      actions.try_before(action);
      actions.before(action);
    } catch (x) {
      if (x instanceof do_instead) {
        var msg = false;
        if (!x.suppress_message && !silently) {
          msg = (s) => { out.write_text("("); out.write(s); out.write(" instead)"); };
        }
        actions.run(x.instead, {silently: silently, write_action: msg});
        return;
      } else {
        throw x;
      }
    }
    actions.carry_out(action);
    if (!silently) {
      actions.report(action);
    }
  }
});

actions.do_first = make_generic_function("do_first", {
  doc: `Runs an action with a '(first /doing something/)' message. If 'silently' is true,
then this message is not printed.`
});
actions.do_first.add_method({
  name: "default",
  handle: function (action, {silently=false}={}) {
    var f = (s) => { out.write("(first "); out.write(s); out.write(")"); };
    actions.run(action, {is_implied: true, silently: silently, write_action: f});
  }
});

function require_x_accessible(verb, name, f) {
  actions.verify.add_method({
    name: name,
    when: (action) => action.verb === verb && !world.accessible_to(f(action), world.actor),
    handle: function (action) {
      var reason;
      if (!world.visible_to(f(action), world.actor)) {
        reason = illogical_not_visible("{Bobs} {can} see no such thing.");
      } else {
        var eff_cont = world.effective_container(world.location(f(action)));
        if (world.openable(eff_cont) && !world.is_open(eff_cont)) {
          reason = illogical_action(() => { out.write("That's inside "); out.the(eff_cont);
                                            out.write(", which is closed."); });
        } else {
          reason = illogical_action("{Bobs} {can't} get to that.");
        }
      }
      return verification.join(this.next(), reason);
    }
  });
}

/** Adds a rule that verifies that the direct object of the action is accessible to the actor. */
function require_dobj_accessible(verb) {
  require_x_accessible(verb, "require_dobj_accessible(" + verb + ")",
                       (action) => action.dobj);
}
/** Adds a rule that verifies that the indirect object of the action is accessible to the actor. */
function require_iobj_accessible(verb) {
  require_x_accessible(verb, "require_iobj_accessible(" + verb + ")",
                       (action) => action.iobj);
}

function require_x_visible(verb, name, f) {
  actions.verify.add_method({
    name: name,
    when: (action) => action.verb === verb && !world.visible_to(f(action), world.actor),
    handle: function (action) {
      var reason = illogical_not_visible("{Bobs} {can} see no such thing.");
      return verification.join(this.next(), reason);
    }
  });
}

/** Adds a rule that verifies that the direct object is visible to the actor. */
function require_dobj_visible(verb) {
  require_x_visible(verb, "require_dobj_visible(" + verb + ")",
                    (action) => action.dobj);
}
/** Adds a rule that verifies that the indirect object is visible to the actor. */
function require_iobj_visible(verb) {
  require_x_visible(verb, "require_iobj_visible(" + verb + ")",
                    (action) => action.iobj);
}

function require_x_held(verb, name, f, {only_hint=false, transitive=true}={}) {
  actions.verify.add_method({
    name: name,
    when: (action) => action.verb === verb,
    handle: function (action) {
      /* The action is more logical if the object is held by the actor. Checks also
         that the object is accessible to the actor. */
      var reason;
      if (world.location(f(action), "owned_by") === world.actor) {
        reason = very_logical_action();
      } else if (!world.visible_to(f(action), world.actor)) {
        reason = illogical_not_visible("{Bobs} {can} see no such thing.");
      } else if (!world.accessible_to(f(action), world.actor)) {
        var eff_cont = world.effective_container(world.location(f(action)));
        if (world.openable(eff_cont) && !world.is_open(eff_cont)) {
          reason = illogical_action(() => { out.write("That's inside "); out.the(eff_cont);
                                            out.write(", which is closed."); });
        } else {
          reason = illogical_action("{Bobs} {can't} get to that.");
        }
      } else if (world.fixed_in_place(f(action))) {
        reason = barely_logical_action();
      } else if (world.accessible_to(f(action), world.actor)) {
        reason = logical_action();
      }
      if (reason) {
        return verification.join(this.next(), reason);
      } else {
        return this.next();
      }
    }
  });
  function is_held(x) {
    if (transitive) {
      return world.actor === world.owner(x) && world.accessible_to(x, world.actor);
    } else {
      return world.location(f(action), "owned_by") === world.actor;
    }
  }
  if (only_hint) {
    actions.before.add_method({
      name: name,
      when: (action) => action.verb === verb,
      handle: function (action) {
        this.next();
        /* A check that the actor is holding the object (possibly transitively). */
        if (world.location(f(action), "worn_by") === world.actor) {
          throw new abort_action(() => { out.write("{Bobs} {are} wearing ");
                                         out.the(f(action)); out.write("."); });
        }
        if (!is_held(f(action))) {
          throw new abort_action(() => { out.write("{Bobs} {aren't} holding ");
                                         out.the(f(action)); out.write("."); });
        }
      }
    });
  } else {
    actions.try_before.add_method({
      name: name,
      when: (action) => action.verb === verb,
      handle: function (action) {
        this.next();
        /* An attempt is made to take the object if the actor is not already holding it. */
        if (world.location(f(action), "worn_by") === world.actor) {
          throw new abort_action(() => { out.write("{Bobs} {are} wearing ");
                                         out.the(f(action)); out.write("."); });
        }
        if (!is_held(f(action))) {
          actions.do_first(taking(f(action)), {silently: true});
        }
        // just in case it succeeds but don't have the object, do a check.
        if (!is_held(f(action))) {
          throw new abort_action(() => { out.write("{Bobs} {aren't} holding ");
                                         out.the(f(action)); out.write("."); });
        }
      }
    });
  }
}

/* Adds rules to check if the direct object is held by the actor.  If the option
   'only_hint' is not true, then if the thing is not already held an attempt is made
   to take it.  The 'transitive' option allows the actor to be the owner of the object
   without necessarily holding it directly. */
function require_dobj_held(verb, opts) {
  require_x_held(verb, "require_dobj_held(" + verb + ")",
                 (action) => action.dobj,
                 opts);
}
function require_iobj_held(verb, opts) {
  require_x_held(verb, "require_iobj_held(" + verb + ")",
                 (action) => action.iobj,
                 opts);
}

function hint_x_not_held(verb, name, f) {
  actions.verify.add_method({
    name: name,
    when: (action) => action.verb === verb && world.location(f(action), "owned_by") === world.actor,
    handle: function (action) {
      return verification.join(this.next(), barely_logical_action());
    }
  });
}
function hint_dobj_not_held(verb) {
  hint_x_not_held(verb, "hint_dobj_not_held(" + verb + ")",
                  (action) => action.dobj);
}
function hint_iobj_not_held(verb) {
  hint_x_not_held(verb, "hint_iobj_not_held(" + verb + ")",
                  (action) => action.iobj);
}

/*** Parser ***/

/*
The parser framework uses top-down parsing with caching.  The `def_parser` function
defines a new cached nonterminal.  Parsers are iterators that yield `parser_match` objects.
*/

var parser = {
  known_words: new Set,
  /* for [something y] and [obj id] commands in understand strings.  Each has
     two methods: make_parser(args) and process(args, parse, match). */
  frontend: {}
};

class parser_match {
  constructor(start, end, value, score) {
    this.start = start; // inclusive
    this.end = end;     // exclusive
    this.value = value; // the parsed value
    this.score = score; // the match score
  }
}

class token {
  constructor(start, end, s) {
    this.start = start; // start index in original string (inclusive)
    this.end = end;     // end index in original string (exclusive)
    this.s = s; // the tokenized version
  }
}

/** Tokenize the input, yielding a list of `token` objects. */
function tokenize(s) {
  var i = 0;
  var toks = [];
  while (i < s.length) {
    if (s.charCodeAt(i) <= 32) {
      i++;
      continue; // skip whitespace
    }
    var j = i;
    while (j < s.length && s[j].match(/[a-z0-9'\-]/i)) {
      // a word is a combination of letters, numbers, hyphens, and apostrophes (for contractions)
      j++;
    }
    if (j === i) {
      toks.push(new token(i, i+1, s[j]));
      i++;
    } else {
      toks.push(new token(i, j, s.slice(i, j).toLowerCase()));
      i = j;
    }
  }
  return toks;
}

/** Define a new cached parser of a given name. */
function def_parser(name) {
  if (parser.name) {
    console.warn(`Parser with name '${name}' already exists.`);
  }
  parser[name] = make_generic_function(name, {
    doc :
`The '${name}' parser. Takes in a cache, the original string, an array
of tokens, and a starting index and returns an iterator of
parser_match objects.`,
    on_call: function* (cache, s, toks, i) {
      /* Maintain a cache of parses. */
      if (!cache[name]) {
        cache[name] = new Map;
      }
      var c;
      if (cache[name].has(i)) {
        c = cache[name].get(i);
        /* We use `c.length` since the array might be extended in the meantime in case there is
           left recursion -- however left recursion isn't exactly supported... */
        for (let i = 0; i < c.length; i++) {
          yield c[i];
        }
      } else {
        console.log(`running parser ${name} at ${i}`);
        c = [];
        cache[name].set(i, c);
        for (let match of this.next()) {
          c.push(match);
          yield match;
        }
      }
    }
  });
  parser[name].add_method({
    name: "no match",
    handle: function* (cache, s, toks, i) {
      /* yield nothing.  this is a match failure. */
    }
  });
  parser[name].understand = function understand(s, result=null, when=null) {
    /* Given something like understand("take [something x]", (parse) => taking(parse.x)),
       adds a new method to the parser for parsing the exact words outside the brackets and using
       the `parser.frontend` definitions for the things in the square brackets.  The `result` can
       either return a parser_match, which is left as-is, or otherwise the parser_match is
       constructed whose score is the sum of the scores. Slashes can be used for alternation,
       for example "go/get in/into [somewhere x]".

       The `when` argument optionally gives a condition under which the created parser method should
       run.  It is passed directly to `add_method`.

       If `s` is an array, then `understand` is applied to each element of `s`.     */

    if (s instanceof Array) {
      s.forEach(s => understand(s, result, when));
      return;
    }

    // first parse the text to understand what to understand
    var toks = [];
    var i = 0;
    while (i < s.length) {
      if (s.charCodeAt(i) <= 32) {
        i++;
        continue; // skip whitespace
      }
      var j = i;
      while (j < s.length && s[j].match(/[a-z0-9']/i)) {
        // a word is a combination of letters, numbers, and apostrophes (for contractions)
        j++;
      }
      if (j === i && s[i] === "[") {
        i++;
        var parts = [];
        while (i < s.length && s[i] !== "]") {
          if (s.charCodeAt(i) <= 32) {
            i++;
            continue;
          } else if (s[i] === "'" || s[i] === "'") {
            let q = s[i];
            j = ++i;
            while (j < s.length && s[j] !== q) {
              j++;
            }
            if (s[j] !== q) {
              throw new TypeError("unmatched quote");
            }
            parts.push(s.slice(i, j));
            i = j + 1;
          } else {
            j = i;
            while (j < s.length && s.charCodeAt(j) > 32 && s[j] !== "]") {
              j++;
            }
            parts.push(s.slice(i, j));
            i = j;
          }
        }
        if (s[i] !== "]") {
          throw new TypeError("missing close ]");
        }
        i++;
        if (parts.length === 0) {
          throw new TypeError("Expecting text inside '[' and ']'");
        }
        toks.push({cmd: parts[0], args: parts.slice(1)});
      } else if (j === i) {
        toks.push(s[i]);
        i++;
      } else {
        toks.push(s.slice(i, j).toLowerCase());
        i = j;
      }
    }
    // Assemble the tokens into a parser
    i = 0;
    var parsers = [];
    var frontend = [];
    while (i < toks.length) {
      if (typeof toks[i] === "string") {
        if (toks[i] === "/") {
          throw new TypeError("Unexpected '/'");
        }
        var alts = [make_parse_word(toks[i])];
        i++;
        while (i < toks.length && toks[i] === "/") {
          i++;
          if (i === toks.length) {
            throw new TypeError("Expecting something after '/'");
          }
          if (toks[i] === "/") {
            throw new TypeError("Unexpected '/'");
          }
          if (typeof toks[i] !== "string") {
            throw new TypeError("Expecting a word after '/'");
          }
          alts.push(make_parse_word(toks[i]));
          i++;
        }
        parsers.push(make_parse_alt(alts));
      } else {
        var fe = parser.frontend[toks[i].cmd];
        if (!fe) {
          throw new Error(`No such frontend '${toks[i].cmd}'`);
        }
        parsers.push(fe.make_parser(toks[i].args));
        frontend.push({idx: parsers.length-1, frontend: fe, args: toks[i].args});
        i++;
      }
    }
    parser[name].add_method({
      name: s,
      when: when,
      handle: function* (cache, s, toks, i) {
        yield* this.next();
        for (var m of make_parse_seq(parsers)(cache, s, toks, i)) {
          var parse = {};
          frontend.forEach(fe => {
            fe.frontend.process(fe.args, parse, m.value[fe.idx]);
          });
          var v;
          if (result) {
            v = result(parse);
            if (v === void 0) {
              continue;
            }
            if (!(v instanceof parser_match)) {
              v = new parser_match(m.start, m.end, v, m.score);
            }
          } else {
            v = new parser_match(m.start, m.end, parse, m.score);
          }
          yield v;
        }
      }
    });
  };
}

/** For every object of the given kind, extract the `words` to build
    maps from words to objects. */
parser.ensure_dict = function (cache, kind) {
  if (!cache.dict) {
    cache.dict = {};
  }
  if (cache.dict[kind]) {
    return;
  }
  console.log("generating dict for " + kind);
  var nouns = new Map;
  var adjs = new Map;
  function add(m, word, o) {
    if (m.has(word)) {
      m.get(word).add(o);
    } else {
      m.set(word, new Set([o]));
    }
    parser.known_words.add(word);
  }
  world.all_of_kind(kind).forEach(o => {
    world.words(o).forEach(word => {
      var list;
      if (word[0] === '@') {
        add(nouns, word.slice(1), o);
      } else {
        add(adjs, word, o);
      }
    });
  });
  cache.dict[kind] = {
    nouns: nouns,
    adjs: adjs
  };
};

parser.init_known_words = function () {
  parser.ensure_dict({}, "thing");
  parser.ensure_dict({}, "room");
};

/** Create a parser that always succeeds, yielding the value of null. */
function make_parse_nothing() {
  return function* (cache, s, toks, i) {
    yield new parser_match(i, i, null, 0);
  };
}
/** Create a parser that matches the end of the tokens list. */
function make_parse_end() {
  return function* (cache, s, toks, i) {
    if (i === toks.length) {
      yield new parser_match(i, i, null, 0);
    }
  };
}
/** Create a parser that tries to match a given token word. */
function make_parse_word(word, score=0) {
  parser.known_words.add(word);
  return function* (cache, s, toks, i) {
    if (i < toks.length && toks[i].s === word) {
      yield new parser_match(i, i+1, word, score);
    }
  };
}
/** Gives the union of all the given parsers. */
function make_parse_alt(parsers) {
  if (parsers.length === 0) {
    return parsers[0];
  }
  return function* (cache, s, toks, i) {
    for (var k = 0; k < parsers.length; k++) {
      yield* parsers[k](cache, s, toks, i);
    }
  };
}
/** Concatenate the parsers so they try to match in sequence.
Matches are arrays of the raw match objects. */
function make_parse_seq(parsers) {
  function mk(k) {
    if (k === 0) {
      return function* (cache, s, toks, i) {
        yield new parser_match(i, i, [], 0);
      };
    } else {
      return function* (cache, s, toks, i) {
        for (var mp of mk(k - 1)(cache, s, toks, i)) {
          for (var m of parsers[k - 1](cache, s, toks, mp.end)) {
            yield new parser_match(mp.start, m.end, mp.value.concat([m]), mp.score + m.score);
          }
        }
      };
    }
  }
  return mk(parsers.length);
}

parser.articles = new Set(["a", "an", "the", "some"]);
parser.articles.forEach(a => parser.known_words.add(a));

function make_parse_kind(kind) {
  return function* (cache, s, toks, i) {
    parser.ensure_dict(cache, kind);
    var j = i;
    if (j < toks.length && parser.articles.has(toks[j].s)) {
      j++;
    }
    function inter(a, b) {
      // null represents the universal set
      if (a === null)
        return b;
      else if (b === null)
        return a;
      else
        return new Set([...a].filter(x => b.has(x))); // apparently this is the idiom?
    }
    function ok(s) { return s === null || s.size > 0; }
    function* in_adj(i, objs) {
      if (i < toks.length) {
        var objs_i = cache.dict[kind].adjs.get(toks[i].s);
        if (objs_i) {
          objs_i = inter(objs, objs_i);
          if (ok(objs_i)) {
            for (var m of in_adj(i + 1, objs_i)) {
              yield new parser_match(i, m.end, m.value, m.score + 1);
            }
          }
        }
      }
      yield* in_noun(i, objs);
    }
    function* in_noun(i, objs) {
      if (i < toks.length) {
        var objs_i = cache.dict[kind].nouns.get(toks[i].s);
        if (objs_i) {
          objs_i = inter(objs, objs_i);
          if (ok(objs_i)) {
            for (var m of in_noun(i + 1, objs_i)) {
              yield new parser_match(i, m.end, m.value, m.score + 2);
            }
          }
        }
      }
      if (objs !== null) {
        for (var o of objs) {
          yield new parser_match(i, i, o, 0);
        }
      }
    }
    // Get the best matches for each possible object
    var matches = new Map;
    for (var m of in_adj(j, null)) {
      var mscore = m.score;
      if (toks.slice(m.start, m.end).map(t => t.s).join(" ") === world.name(m.value).toLowerCase()) {
        // exact match, bonus point
        mscore += 1;
      }
      if (!matches.has(m.value) || matches.get(m.value).score < mscore) {
        matches.set(m.value, new parser_match(i, m.end, m.value, mscore));
      }
    }
    yield* matches.values();
  };
}

def_parser("anything", {
  doc: "Parse a thing that is in the world, even if it is not visible to the actor (c.f. 'something')"
});
parser.frontend.anything = {
  make_parser([v]) {
    return parser.anything;
  },
  process([v], parse, match) {
    parse[v] = match.value;
  }
};
parser.anything.add_method({
  name: "main parser",
  handle: function* (cache, s, toks, i) {
    yield* this.next();
    yield* make_parse_kind("thing")(cache, s, toks, i);
  }
});

def_parser("something", {
  doc: `Parse a thing that is visible to the actor in the world.  Filters the 'anything' parser,
so if it is almost certainly better to extend that parser instead of this one.`
});
parser.frontend.something = {
  make_parser([v]) {
    return parser.something;
  },
  process([v], parse, match) {
    parse[v] = match.value;
  }
};
parser.something.add_method({
  name: "main parser",
  handle: function* (cache, s, toks, i) {
    yield* this.next();
    for (var m of parser.anything(cache, s, toks, i)) {
      if (world.visible_to(m.value, world.actor)) {
        yield m;
      }
    }
  }
});

def_parser("anywhere", {
  doc: "Parse a room that is in the world, even if it is unknown to the player."
});
parser.frontend.anywhere = {
  make_parser([v]) {
    return parser.anywhere;
  },
  process([v], parse, match) {
    parse[v] = match.value;
  }
};
parser.anywhere.add_method({
  name: "main parser",
  handle: function* (cache, s, toks, i) {
    yield* this.next();
    yield* make_parse_kind("room")(cache, s, toks, i);
  }
});

def_parser("somewhere", {
  doc: `Parse a room that is known to the actor.  Filters the 'anywhere' parser,
so if it is almost certainly better to extend that parser instead of this one.`
});
parser.frontend.somewhere = {
  make_parser([v]) {
    return parser.somewhere;
  },
  process([v], parse, match) {
    parse[v] = match.value;
  }
};
parser.somewhere.add_method({
  name: "main parser",
  handle: function* (cache, s, toks, i) {
    yield* this.next();
    for (var m of parser.anywhere(cache, s, toks, i)) {
      if (world.known(m.value, world.actor)) {
        yield m;
      }
    }
  }
});

/* Parse a specific object that is visible. */
parser.frontend.obj = {
  make_parser([x]) {
    return function* (cache, s, toks, i) {
      for (var m of parser.something(cache, s, toks, i)) {
        if (m.value === x) {
          // Give a small score bonus
          yield new parser_match(m.start, m.end, m.value, m.score + 1);
        }
      }
    };
  },
  process([x], parse, match) {
    // nothing to process
  }
};

def_parser("text", {
  doc: "Just parse a string of one or more tokens.  Results in part of the original string."
});
parser.frontend.text = {
  make_parser([v]) {
    return parser.text;
  },
  process([v], parse, match) {
    parse[v] = match.value;
  }
};
parser.text.add_method({
  name: "main parser",
  handle: function* (cache, s, toks, i) {
    for (let j = i; j < toks.length; j++) {
      yield new parser_match(i, j + 1, s.slice(toks[i].start, toks[j].end), 1);
    }
  }
});

def_parser("direction", {
  doc: "The parser for directions"
});
parser.frontend.direction = {
  make_parser([v]) {
    return parser.direction;
  },
  process([v], parse, match) {
    parse[v] = match.value;
  }
};
parser.direction.understand("north/n", (parse) => "north");
parser.direction.understand("south/s", (parse) => "south");
parser.direction.understand("east/e", (parse) => "east");
parser.direction.understand("west/w", (parse) => "west");
parser.direction.understand("northwest/nw", (parse) => "northwest");
parser.direction.understand("southwest/sw", (parse) => "southwest");
parser.direction.understand("northeast/ne", (parse) => "northeast");
parser.direction.understand("southeast/se", (parse) => "southeast");
parser.direction.understand("up/u", (parse) => "up");
parser.direction.understand("down/d", (parse) => "down");
parser.direction.understand("in/inside", (parse) => "in");
parser.direction.understand("out/outside/away", (parse) => "out");

def_parser("action", {
  doc: "The main parser for actions"
});
parser.frontend.action = {
  make_parser([v]) {
    return parser.action;
  },
  process([v], parse, match) {
    parse[v] = match.value;
  }
};

def_parser("command", {
  doc: "The parser for complete commands"
});
parser.command.add_method({
  name: "action",
  handle: function* (cache, s, toks, i) {
    yield* this.next();
    for (var m of parser.action(cache, s, toks, i)) {
      if (m.end === toks.length || (m.end + 1 === toks.length && toks[toks.length - 1].s === ".")) {
        yield m;
      }
    }
  }
});

/*** Main game loop ***/

world.global.set("game title", `(set title with 'world.global.set("game title", "My Game")')`);
world.global.set("game headline", `An interactive fiction`);
world.global.set("game author", `(set author with 'world.global.set("game author", "Me")')`);
world.global.set("release number", '1');
world.global.set("game description", null);

def_activity("start_game", {
  doc: "Procedure run at the beginning of the game."
});
world.start_game.add_method({
  name: "default nothing",
  handle: () => {}
});
world.start_game.add_method({
  name: "move backdrops",
  handle: function () {
    this.next();
    var room = world.containing_room(world.actor);
    if (room) {
      world.move_backdrops(room);
    }
  }
});
world.start_game.add_method({
  name: "Print game description",
  handle: function () {
    this.next();
    var desc = world.global("game description");
    if (desc) {
      out.write(desc);
      out.para();
    }
    out.with_block("div", () => {
      out.add_class("game_title");
      out.write(world.global("game title"));
    });
    out.with_block("div", () => {
      out.add_class("game_headline");
      out.write(world.global("game headline"), " by ", world.global("game author"));
    });
    out.with_block("div", () => {
      out.add_class("game_release");
      out.write("Release number ", world.global("release number"));
    });
    out.write("Type '[action help]' for help.[para]");
  }
});
world.start_game.add_method({
  name: "Give initial room description",
  handle: function () {
    this.next();
    world.describe_current_location();
    world.save_current_location();
  }
});

def_activity("save_current_location", {
  doc: `Store information about the current location in global variables for the
purpose of detecting changes to decide to describe the current location again.`
});
world.save_current_location.add_method({
  name: "default",
  handle: () => {
    var loc = world.location(world.actor);
    if (loc) {
      loc = world.visible_container(loc);
    }
    world.global.set("last location", loc);
    world.global.set("last light", loc ? world.contains_light(loc) : null);
  }
});

def_activity("should_describe_location", {
  doc: `Determine whether the location should be described again.`
});
world.should_describe_location.add_method({
  name: "default",
  handle: () => {
    var loc = world.location(world.actor);
    if (loc) {
      loc = world.visible_container(loc);
    }
    var light = loc ? world.contains_light(loc) : null;
    return world.global("last location") !== loc || world.global("last light") !== light;
  }
});

def_activity("step_turn", {
  doc: "Procedure run after every action."
});
world.step_turn.add_method({
  name: "default nothing",
  handle: () => {}
});
world.step_turn.add_method({
  name: "move backdrops",
  handle: function () {
    this.next();
    var room = world.containing_room(world.actor);
    if (room) {
      world.move_backdrops(room);
    }
  }
});
world.step_turn.add_method({
  name: "describe location",
  handle: function () {
    this.next();
    if (world.should_describe_location()) {
      world.describe_current_location();
      world.save_current_location();
    }
  }
});

var game_listeners = new Map;
game_listeners.set("input", []);
function add_game_listener(name, f) {
  game_listeners.get(name).push(f);
}
function game_listeners_notify(name, ...args) {
  game_listeners.get(name).forEach(f => f(...args));
}

function* game_loop() {
  parser.init_known_words();
  out.para();
  world.start_game();
  var try_input = false;
  var input;
  main:
  while (1) {
    out.para();
    if (try_input) {
      // A flag that the input variable is still good.
      try_input = false;
    } else {
      input = yield {cmd: "input"};
    }
    var toks = tokenize(input);
    if (toks.length === 0) {
      continue main;
    }
    var matches = Array.from(parser.command({}, input, toks, 0));
    if (matches.length === 0) {
      // Maybe we didn't know one of the words
      for (let i = 0; i < toks.length; i++) {
        if (!parser.known_words.has(toks[i].s)) {
          let w = input.slice(toks[i].start, toks[i].end);
          if (w === ".") {
            out.write_text("[I don't know how to handle multiple sentences at once.]");
            continue main;
          } else {
            out.write_text(`[I don't know what you mean by '${w}'.]`);
            continue main;
          }
        }
      }
      out.write_text("[I don't understand what you mean.]");
      continue main;
    }
    var action, disambiguated;
    if (matches.length === 1) {
      action = matches[0].value;
      disambiguated = false;
    } else {
      // Need to disambiguate

      if (false) {
        out.write_text("[Ambiguous!]");
        matches.forEach(m => {
          out.para();
          actions.write_gerund_form(m.value);
          out.write_text(` (score: ${m.score})`);
        });
      }

      // Ask verifier
      var verified = matches.map(m => ({match: m, verification: actions.verify(m.value)}));
      // We remove the things that are illogical due to invisibility.
      verified = verified.filter(v => !v.verification.not_visible);
      // Sort by verification score in increasing order.
      verified.sort((v1, v2) => v1.verification.score - v2.verification.score);

      if (verified.length === 0) {
        // This leaks some information that it parsed, but it seems like the least we could do.
        out.write("{Bobs} {can} see no such thing.");
        continue main;
      }

      // making mistake is a special case
      if (verified.some(v => v.match.value.verb === "making mistake")) {
        verified = verified.filter(v => v.match.value.verb === "making mistake");
      }

      if (verified.every(v => !v.verification.is_reasonable())) {
        // Go for the worst one unreasonable action then.
        action = verified[0].match.value;
        disambiguated = true;
      } else {
        // Good, there is an acceptible action.
        verified = verified.filter(v => v.verification.is_reasonable());
        disambiguated = verified.length > 1;
        var best_score = verified[verified.length - 1].verification.score;
        var best_matches = verified.filter(v => v.verification.score === best_score).map(v => v.match);
        if (best_matches.length === 1) {
          action = best_matches[0].value;
        } else {
          // Sort by match scores in descending order
          best_matches.sort((m1, m2) => m2.score - m1.score);
          best_score = best_matches[0].score;
          // Remove everything but the best scores
          best_matches = best_matches.filter(m => m.score === best_score);
          if (best_matches.length === 1) {
            // Specificity scores disambiguated
            action = best_matches[0].value;
            disambiguated = true;
          } else {
            // Need user help to disambiguate.
            var best_actions = best_matches.map(m => m.value);
            if (best_actions.length > 6) {
              // This seems like a horrible mistake happened, so let's not try.
              out.write_text("[Your input was surprisingly ambiguous.]");
              continue main;
            }
            function cmp_str(s1, s2) { if (s1 < s2) return -1; else if (s1 > s2) return 1; else return 0; }
            best_actions.sort((a1, a2) => cmp_str(a1.verb, a2.verb));
            out.write("Which of the following did you mean?");
            out.with_block("ol", () => {
              for (var i = 0; i < best_actions.length; i++) {
                out.with_block("li", () => {
                  out.wrap_action_link('' + (i + 1), () => {
                    out.without_action_links(() => {
                      actions.write_infinitive_form(best_actions[i]);
                    });
                  });
                });
              }
            });
            // Wait for response
            input = yield {cmd: "input"};
            let num = (+input) - 1;
            if (!isNaN(num) && 0 <= num && num < best_actions.length) {
              action = best_actions[num];
            } else {
              try_input = true;
              continue main;
            }
          }
        }
      }
    }

    try {
      actions.run(action, {write_action: disambiguated});
    } catch (x) {
      if (x instanceof abort_action) {
        if (x.reason) {
          out.para();
          out.write(x.reason);
        }
      } else {
        out.para();
        out.write_text("[Internal error. Stack trace in console. Proceed at your own risk.]");
        console.error(x, x.stack);
        continue main;
      }
    }
    world.step_turn();
  }
}

function game_continue(f, /*opt*/val) {
  try {
    var v = f.next(val);
  } catch (x) {
    out.para();
    out.write_text("[Internal error. Stack trace in console.]");
    throw x;
  }
  if (v.done) {
    console.log("game is over.");
    return;
  }
  switch (v.value.cmd) {
  case "input":
    game_listeners_notify("input", (input) => {
      game_continue(f, input);
    });
    break;
  }
}

function start_game_loop() {
  game_continue(game_loop());
}


/*** Basic actions ***/

//// Making a mistake (user error)

/* This is mainly used to parse things as errors.  It can also be used to give amusing
   responses for certain inputs without having to go through the effort of defining a verb. */

function making_mistake(reason) {
  return {verb: "making mistake", reason: reason};
}
def_verb("making mistake", "make mistake", "making mistake");

actions.before.add_method({
  name: "making mistake",
  when: (action) => action.verb === "making mistake",
  handle: function (action) {
    throw new abort_action(action.reason);
  }
});

function all_are_mistakes(mistakes, reason) {
  if (!(mistakes instanceof Array)) {
    throw new TypeError("The mistakes must be an array of parser patterns");
  }
  mistakes.forEach(m => {
    parser.action.understand(m, (parse) => making_mistake(reason));
  });
}

all_are_mistakes(["turn around/left/right/backward/backwards",
                  "look backwards/left/right"],
                 (parse) => making_mistake(`{Bobs} {aren't} facing any particular
direction, so turning around makes no sense.`));

//// Help

/* This action is a bit odd because it's directed toward the person playing the game. */
function getting_help() {
  return {verb: "help"};
}
def_verb("help", "get help", "getting help");

parser.action.understand("help", (parse) => getting_help());

actions.carry_out.add_method({
  name: "help",
  when: (action) => action.verb === "help",
  handle: function (action) {
    out.write_text("[");
    out.write(`You are controlling a character in a virtual world.  To
play the game, you must give the character commands to interact
with their surroundings.

[para]Some examples of commands one may try are the following:

[enter_block ul]
[enter_block li]look ('l' for short)[leave]
[enter_block li]inventory ('i' for short)[leave]
[enter_block li]take [enter_inline i]something[leave][leave]
[enter_block li]drop [enter_inline i]something[leave][leave]
[enter_block li]put [enter_inline i]something[leave] in [enter_inline i]something[leave][leave]
[enter_block li]put [enter_inline i]something[leave] on [enter_inline i]something[leave][leave]
[enter_block li]go [enter_inline i]direction[leave] (or the first letter of the direction for short)[leave]
[enter_block li]enter [enter_inline i]something[leave][leave]
[enter_block li]leave[leave]
[enter_block li]open [enter_inline i]something[leave][leave]
[enter_block li]close [enter_inline i]something[leave][leave]
[enter_block li]unlock [enter_inline i]something[leave] with [enter_inline i]something[leave][leave]
[enter_block li]turn on [enter_inline i]something[leave][leave]
[enter_block li]ask [enter_inline i]someone[leave] about [enter_inline i]something[leave][leave]
[enter_block li]ask [enter_inline i]someone[leave] for [enter_inline i]something[leave][leave]
[enter_block li]ask [enter_inline i]someone[leave] to [enter_inline i]some action[leave][leave]
[enter_block li]give [enter_inline i]something[leave] to [enter_inline i]someone[leave][leave]
[leave]

[para]This list is not exhaustive. Part of the fun is figuring
out what you can do.

[para]You may also click the underlined words to go in a direction
or examine a particular object.

[para]If you get stuck, don't forget to examine things, as oftentimes
vital clues are left in descriptions (this being a text-based game).

[para]For more help, take a look at
[enter_inline a][attr href 'http://eblong.com/zarf/if.html'][attr target '_blank']http://eblong.com/zarf/if.html[leave]
for a reference card of perhaps-possible things to try.`);
    out.write_text("]");
  }
});

//// Look

function looking() {
  return {verb: "looking"};
}
def_verb("looking", "look", "looking");

parser.action.understand("look/l/ls", (parse) => looking());
parser.action.understand("look around", (parse) => looking());

actions.carry_out.add_method({
  name: "looking",
  when: (action) => action.verb === "looking",
  handle: (action) => world.describe_current_location()
});

//// Looking in a direction

function looking_toward(dir) {
  return {verb: "looking toward", dir: dir};
}
actions.write_gerund_form.add_method({  
  when: (action) => action.verb === "looking toward",
  handle: (action) => out.write("looking " + action.dir)
});
actions.write_infinitive_form.add_method({
  when: (action) => action.verb === "looking toward",
  handle: (action) => out.write("look " + action.dir)
});

parser.action.understand("look/l [direction d]", (parse) => looking_toward(parse.d));

actions.carry_out.add_method({
  name: "looking toward",
  when: (action) => action.verb === "looking toward",
  handle: (action) => world.describe_direction(action.dir)
});

//// Inventory

function taking_inventory() {
  return {verb: "taking inventory"};
}
def_verb("taking inventory", "take inventory", "taking inventory");

parser.action.understand("inventory/i", (parse) => taking_inventory());

/* This is carry_out and not report since the whole point of inventory is the text output. */
actions.carry_out.add_method({
  name: "taking inventory",
  when: (action) => action.verb === "taking inventory",
  handle: function (action) {
    if (world.contents(world.actor).length === 0) {
      out.write("{Bobs} {are} carrying nothing.");
    } else {
      out.write("{Bobs} {are} carrying:");
      world.describe_contents(world.actor);
    }
  }
});

//// Examining objects

function examining(x) {
  return {verb: "examining", dobj: x};
}
def_verb("examining", "examine", "examining");

parser.action.understand("examine/x/read/inspect [something x]", (parse) => examining(parse.x));
parser.action.understand("look at/inside/in/toward [something x]", (parse) => examining(parse.x));
// This might cause problems for the disambiguator:
parser.action.understand("look [something x]", (parse) => examining(parse.x));

all_are_mistakes(["examine/x/read/inspect", "look at/inside"],
                 `{Bobs} {need} to be examining something in particular.`);

require_dobj_visible("examining");

/* This is carry_out and not report since the whole point of examining something is the text output. */
actions.carry_out.add_method({
  name: "examining",
  when: (action) => action.verb === "examining",
  handle: (action) => world.describe_object(action.dobj)
});

//// Taking

function taking(x) {
  return {verb: "taking", dobj: x};
}
def_verb("taking", "take", "taking");

parser.action.understand("take/get/pickup [something x]", (parse) => taking(parse.x));
parser.action.understand("pick up [something x]", (parse) => taking(parse.x));
parser.action.understand("pick [something x] up", (parse) => taking(parse.x));

all_are_mistakes(["take/get/pickup/pick", "pick up"],
                 `{Bobs} {need} to be taking something in particular.`);

require_dobj_accessible("taking");
hint_dobj_not_held("taking");

actions.verify.add_method({
  name: "not too reasonable taking things fixed in place",
  when: (action) => action.verb === "taking" && world.fixed_in_place(action.dobj),
  handle: function (action) {
    return verification.join(this.next(),
                             barely_logical_action());
  }
});

actions.before.add_method({
  name: "can't take contents of actor",
  when: (action) => action.verb === "taking" && world.contents(world.actor).includes(action.dobj),
  handle: function (action) {
    throw new abort_action("{Bobs} already {have} that.");
  }
});
actions.before.add_method({
  name: "can't take possessions of others",
  when: (action) => (action.verb === "taking" &&
                     world.owner(action.dobj) && world.owner(action.dobj) !== world.actor),
  handle: function (action) {
    throw new abort_action("That is not {ours} to take.");
  }
});
actions.before.add_method({
  name: "can't take what's fixed in place",
  when: (action) => action.verb === "taking" && world.fixed_in_place(action.dobj),
  handle: function (action) {
    throw new abort_action(world.no_take_msg(action.dobj));
  }
});
actions.before.add_method({
  name: "can't take parts of things",
  when: (action) => action.verb === "taking" && world.location.is_related(action.dobj, "part_of"),
  handle: function (action) {
    out.write("That's part of "); out.the(world.location(action.dobj)); out.write(".");
    throw new abort_action();
  }
});
actions.before.add_method({
  name: "can't take people",
  when: (action) => action.verb === "taking" && world.is_a(action.dobj, "person"),
  handle: function (action) {
    out.The(action.dobj); out.write(" doesn't look like ");
    out.write_text(world.subject_pronoun(action.dobj)); out.write("'d appreciate that.");
    throw new abort_action();
  }
});
actions.before.add_method({
  name: "can't take self",
  when: (action) => action.verb === "taking" && action.dobj === world.actor,
  handle: function (action) {
    throw new abort_action("{Bobs} cannot take {ourself}.");
  }
});
actions.before.add_method({
  name: "can't take what one's inside",
  when: (action) => action.verb === "taking",
  handle: function (action) {
    var loc = world.location(world.actor);
    while (loc && !world.is_a(loc, "room")) {
      if (loc === action.dobj) {
        if (world.is_a(loc, "container")) {
          out.write("{Bobs} would have to get out of "); out.the(loc); out.write(" first.");
        } else if (world.is_a(loc, "supporter")) {
          out.write("{Bobs} would have to get off of "); out.the(loc); out.write(" first.");
        } else {
          throw new Error("Unknown object location type.");
        }
        throw new abort_action();
      }
      loc = world.location(loc);
    }
    this.next();
  }
});

actions.carry_out.add_method({
  name: "taking",
  when: (action) => action.verb === "taking",
  handle: function (action) {
    world.give_to(action.dobj, world.actor);
  }
});

actions.report.add_method({
  name: "taking",
  when: (action) => action.verb === "taking",
  handle: function (action) {
    out.write("Taken.");
  }
});

//// Dropping

function dropping(x) {
  return {verb: "dropping", dobj: x};
}
def_verb("dropping", "drop", "dropping");

parser.action.understand("drop [something x]", (parse) => dropping(parse.x));
parser.action.understand("put/set down [something x]", (parse) => dropping(parse.x));
parser.action.understand("put/set [something x] down", (parse) => dropping(parse.x));

all_are_mistakes(["drop/set", "put/set down"],
                 `{Bobs} {need} to be dropping something in particular.`);

require_dobj_held("dropping", {only_hint: true, transitive: true});

actions.before.add_method({
  name: "dropping",
  when: (action) => action.verb === "dropping" && action.dobj === world.actor,
  handle: function (action) {
    throw new abort_action("{Bobs} {can't} be dropped.");
  }
});

actions.carry_out.add_method({
  name: "dropping",
  when: (action) => action.verb === "dropping",
  handle: function (action) {
    var loc = world.location(world.actor);
    world.put_in(action.dobj, loc);
  }
});

actions.report.add_method({
  name: "dropping",
  when: (action) => action.verb === "dropping",
  handle: function (action) {
    out.write("Dropped.");
  }
});

//// Inserting into

function inserting_into(x, y) {
  return {verb: "inserting into", dobj: x, iobj: y};
}
def_verb("inserting into", "insert", "inserting", "into");

parser.action.understand("put/place/insert/drop/set [something x] in/into [something y]",
                         parse => inserting_into(parse.x, parse.y));

all_are_mistakes(["insert"], "{Bobs} {need} to be inserting something in particular.");
all_are_mistakes(["insert [something x]", "insert [something x] in/into"],
                 "{Bobs} {need} to be inserting that into something in particular.");

require_dobj_held("inserting into");
require_iobj_accessible("inserting into");

actions.verify.add_method({
  name: "inserting into self",
  when: action => action.verb === "inserting into" && action.iobj === action.dobj,
  handle: function (action) {
    return verification.join(this.next(),
                             illogical_action("{Bobs} {can't} put that into itself."));
  }
});
actions.verify.add_method({
  name: "inserting into again",
  when: action => action.verb === "inserting into" && action.iobj === world.location(action.dobj),
  handle: function (action) {
    return verification.join(this.next(),
                             illogical_action("That is already in there."));
  }
});
actions.verify.add_method({
  name: "inserting into container",
  when: action => action.verb === "inserting into" && world.is_a(action.iobj, "container"),
  handle: function (action) {
    return verification.join(this.next(), non_obvious_action());
  }
});
actions.before.add_method({
  name: "inserting into contents",
  when: action => action.verb === "inserting into",
  handle: function (action) {
    this.next();
    var loc = world.location(action.iobj);
    while (loc && !world.is_a(loc, "room")) {
      if (loc === action.dobj) {
        out.write("{Bobs} {will} have to remove ");
        out.the(action.iobj);
        out.write(" from ");
        out.the(action.dobj);
        out.write(" first.");
        throw new abort_action();
      }
      loc = world.location(loc);
    }
  }
});
actions.before.add_method({
  name: "inserting into closed",
  when: action => (action.verb === "inserting into" && world.openable(action.iobj)
                   && !world.is_open(action.iobj)),
  handle: function (action) {
    actions.do_first(opening(action.iobj), {silently: true});
    if (!world.is_open(action.iobj)) {
      out.The(action.iobj); out.write(" is closed.");
      throw new abort_action();
    }
    this.next();
  }
});
actions.before.add_method({
  name: "inserting into non-container",
  when: action => action.verb === "inserting into" && !world.is_a(action.iobj, "container"),
  handle: function (action) {
    out.write("{Bobs} {can't} put "); out.the(action.dobj); out.write(" into ");
    out.the(action.iobj); out.write(".");
    throw new abort_action();
  }
});
actions.before.add_method({
  name: "inserting into supporter",
  when: action => action.verb === "inserting into" && world.is_a(action.iobj, "supporter"),
  handle: function (action) {
    throw new do_instead(placing_on(action.dobj, action.iobj));
  }
});
actions.carry_out.add_method({
  name: "inserting into",
  when: action => action.verb === "inserting into",
  handle: function (action) {
    world.put_in(action.dobj, action.iobj);
  }
});
actions.report.add_method({
  name: "inserting into",
  when: action => action.verb === "inserting into",
  handle: function (action) {
    out.write("{Bobs} {put} "); out.the(action.dobj); out.write(" into ");
    out.the(action.iobj); out.write(".");
  }
});

//// Placing on

function placing_on(x, y) {
  return {verb: "placing on", dobj: x, iobj: y};
}
def_verb("placing on", "place", "placing", "on");

parser.action.understand("put/place/drop/set [something x] on/onto [something y]",
                         parse => placing_on(parse.x, parse.y));

all_are_mistakes(["place/drop/set [something x] on", "put/place/drop/set [something x] onto"],
                 "{Bobs} {need} to be placing that onto something in particular.");

require_dobj_held("placing on");
require_iobj_accessible("placing on");

actions.verify.add_method({
  name: "placing on self",
  when: action => action.verb === "placing on" && action.iobj === action.dobj,
  handle: function (action) {
    return verification.join(this.next(),
                             illogical_action("{Bobs} {can't} place that on itself."));
  }
});
actions.verify.add_method({
  name: "placing on again",
  when: action => action.verb === "placing on" && action.iobj === world.location(action.dobj),
  handle: function (action) {
    return verification.join(this.next(),
                             illogical_action("That is already placed there."));
  }
});
actions.verify.add_method({
  name: "placing on supporter",
  when: action => action.verb === "placing on" && world.is_a(action.iobj, "supporter"),
  handle: function (action) {
    return verification.join(this.next(), non_obvious_action());
  }
});
actions.before.add_method({
  name: "placing on contents",
  when: action => action.verb === "placing on",
  handle: function (action) {
    this.next();
    var loc = world.location(action.iobj);
    while (loc && !world.is_a(loc, "room")) {
      if (loc === action.dobj) {
        out.write("{Bobs} {will} have to take ");
        out.the(action.iobj);
        out.write(" off ");
        out.the(action.dobj);
        out.write(" first.");
        throw new abort_action();
      }
      loc = world.location(loc);
    }
  }
});
actions.before.add_method({
  name: "placing on non-supporter",
  when: action => action.verb === "placing on" && !world.is_a(action.iobj, "supporter"),
  handle: function (action) {
    out.write("{Bobs} {can't} place "); out.the(action.dobj); out.write(" on ");
    out.the(action.iobj); out.write(".");
    throw new abort_action();
  }
});
actions.before.add_method({
  name: "placing on container",
  when: action => action.verb === "placing on" && world.is_a(action.iobj, "container"),
  handle: function (action) {
    throw new do_instead(inserting_into(action.dobj, action.iobj));
  }
});
actions.carry_out.add_method({
  name: "placing on",
  when: action => action.verb === "placing on",
  handle: function (action) {
    world.put_in(action.dobj, action.iobj);
  }
});
actions.report.add_method({
  name: "placing on",
  when: action => action.verb === "placing on",
  handle: function (action) {
    out.write("{Bobs} {place} "); out.the(action.dobj); out.write(" onto ");
    out.the(action.iobj); out.write(".");
  }
});


//// Going

/*
To resolve going in a direction, it's useful to calculate where we're going,
what we're going through (the via), and where we're coming from.
*/

function going(dir, from=null, via=null, to=null) {
  return {verb: "going", dir: dir, from: from, via: via, to: to, setup: false};
}
actions.write_gerund_form.add_method({
  when: (action) => action.verb === "going",
  handle: function (action) {
    out.write_text("going " + action.dir);
    if (action.to) {
      out.write(" to ", world.definite_name(action.to));
    }
    if (action.via && action.via !== action.to) {
      out.write(" via "); out.the(action.via);
    }
  }
});
actions.write_infinitive_form.add_method({
  when: (action) => action.verb === "going",
  handle: function (action) {
    out.write_text("go " + action.dir);
    if (action.to) {
      out.write(" to ", world.definite_name(action.to));
    }
    if (action.via && action.via !== action.to) {
      out.write(" via "); out.the(action.via);
    }
  }
});

parser.action.understand("go/g [direction d]", (parse) => going(parse.d));
parser.action.understand("[direction d]", (parse) => going(parse.d));

all_are_mistakes(["go/g"], "{Bobs} {need} to be going in a particular direction.");

actions.setup_action.add_method({
  name: "going setup",
  when: (action) => action.verb === "going",
  handle: function (action) {
    /* Initialize the 'from', 'via', and 'to' fields of a going action.  Call this whenever
       these fields need to be accessed. */
    if (!action.setup) {
      action.setup = true;
      action.from = world.containing_room(world.actor);
      world.exits(action.from).forEach(e => {
        if (e.tag === action.dir) {
          action.via = e.obj;
        }
      });
      if (!action.via) {
        return;
      }
      action.to = action.via;
      if (world.is_a(action.via, "door")) {
        action.to = world.door_other_side_from(action.via, action.from);
      }
    }
  }
});

actions.verify.add_method({
  name: "very logical to go in direction that exists",
  when: (action) => action.verb === "going",
  handle: function (action) {
    var room = world.containing_room(world.actor);
    if (world.get_room_exit_directions(room).includes(action.dir)) {
      return verification.join(this.next(),
                               very_logical_action());
    } else {
      return this.next();
    }
  }
});

actions.try_before.add_method({
  name: "try opening a closed door before going",
  when: (action) => action.verb === "going",
  handle: function (action) {
    actions.setup_action(action);
    if (action.via && world.is_a(action.via, "door")) {
      if (world.openable(action.via) && !world.is_open(action.via)) {
        actions.do_first(opening(action.via), {silently: true});
      }
    }
    this.next();
  }
});

actions.try_before.add_method({
  name: "try leaving containers and supporters before going",
  when: (action) => action.verb === "going",
  handle: function (action) {
    actions.setup_action(action);
    var loc = world.location(world.actor);
    var first_loc = loc;
    while (loc && action.from && action.from !== loc) {
      if (world.is_a(loc, "supporter")) {
        actions.do_first(getting_off(loc), {silently: true});
      } else {
        actions.do_first(exiting(loc), {silently: true});
      }
      var new_loc = world.parent_enterable(world.actor);
      if (new_loc === loc) {
        out.write("{Bobs} {can't} leave "); out.the(loc); out.write(".");
        throw new abort_action();
      }
      loc = new_loc;
    }
    if (first_loc !== loc) {
      // This is to reset the from/via/to
      throw new do_instead(going(action.dir), true);
    }
    this.next();
  }
});

actions.before.add_method({
  name: "check that the going via is open if it is a door",
  when: (action) => action.verb === "going",
  handle: function (action) {
    this.next();
    actions.setup_action(action);
    if (action.via && world.is_a(action.via, "door")) {
      if (world.openable(action.via) && !world.is_open(action.via)) {
        throw new abort_action(world.no_go_msg(action.from, action.dir));
      }
    }
  }
});

actions.before.add_method({
  name: "check that there is a destination when going",
  when: (action) => action.verb === "going",
  handle: function (action) {
    this.next();
    actions.setup_action(action);
    if (!action.to) {
      throw new abort_action(world.no_go_msg(action.from, action.dir));
    }
  }
});

actions.carry_out.add_method({
  name: "going",
  when: (action) => action.verb === "going",
  handle: function (action) {
    this.next();
    world.put_in(world.actor, action.to);
  }
});

actions.report.add_method({
  name: "going",
  when: (action) => action.verb === "going",
  handle: function (action) {
    this.next();
    out.write(world.when_go_msg(action.from, action.dir));
  }
});

//// Going to

/*
Going to a place by name is implemented using a try_before that turns it
into a sequence of going actions.
*/

function going_to(room) {
  return {verb: "going to", room: room};
}
actions.write_gerund_form.add_method({
  when: (action) => action.verb === "going to",
  handle: function (action) {
    out.write("going to ", world.definite_name(action.room));
  }
});
actions.write_infinitive_form.add_method({
  when: (action) => action.verb === "going to",
  handle: function (action) {
    out.write("go to ", world.definite_name(action.room));
  }
});

parser.action.understand("go/g to/into [somewhere x]", (parse) => going_to(parse.x));
parser.action.understand("goto/go/g [somewhere x]", (parse) => going_to(parse.x));

all_are_mistakes(["go/g to", "goto"], "{Bobs} {need} to be going somewhere in particular.");

actions.verify.add_method({
  name: "going to",
  when: (action) => action.verb === "going to",
  handle: function (action) {
    if (world.containing_room(world.actor) === action.room
        || world.known(action.room, world.actor)) {
      return verification.join(this.next(),
                               logical_action());
    } else {
      return verification.join(this.next(),
                               illogical_not_visible("{Bobs} {know} of no such place."));
    }
  }
});

actions.try_before.add_method({
  name: "going to",
  when: (action) => action.verb === "going to",
  handle: function (action) {
    /* Plan out a path and then attempt to follow it. */

    var start_loc = world.containing_room(world.actor);
    var dest_loc = action.room;
    if (start_loc === dest_loc) {
      throw new abort_action("{Bobs} {are} already there.");
    }

    // breadth-first search
    var queue = [[{to: start_loc}]]; // queue of current paths
    var visited = new Set;
    var found = null;
    search:
    while (queue.length > 0) {
      var path = queue.shift();
      var cur_loc = path[path.length - 1].to;
      if (cur_loc === dest_loc) {
        found = path;
        found.shift();
        break search;
      }
      visited.add(cur_loc);
      for (var e of world.exits(cur_loc)) {
        var via = e.obj;
        var next = e.obj;
        if (world.is_a(e.obj, "door")) {
          next = world.door_other_side_from(e.obj, cur_loc);
        }
        if (!visited.has(next) && world.known(next, world.actor)) {
          var new_path = path.concat([{verb: "going",
                                       dir: e.tag,
                                       from: cur_loc,
                                       via: via,
                                       to: next}]);
          queue.push(new_path);
        }
      }
    }

    if (!found) {
      out.write("{Bobs} {don't} know how to get to ", world.definite_name(dest_loc), ".");
      throw new abort_action();
    }

    // attempt to carry out the plan
    var first = true;
    for (let a of found) {
      if (a.to === dest_loc) {
        throw new do_instead(a, {suppress_message: found.length === 1});
      } else if (first) {
        actions.do_first(a);
      } else {
        var f = (s) => { out.write("(then "); out.write(s); out.write(")"); };
        actions.run(a, {is_implied: true, write_action: f});
      }
      first = false;
    }
  }
});

//// Entering

function entering(x) {
  return {verb: "entering", dobj: x};
}
def_verb("entering", "enter", "entering");

parser.action.understand("enter [something x]", (parse) => entering(parse.x));
parser.action.understand("get/go/stand/sit in/into/on/through [something x]", (parse) => entering(parse.x));
parser.action.understand("get on top of [something x]", (parse) => entering(parse.x));
parser.action.understand("sit down on [something x]", (parse) => entering(parse.x));
parser.action.understand("sit [something x]", (parse) => entering(parse.x));

all_are_mistakes(["enter",
                  "get/go/stand/sit into/on/through", "get/stand/sit in",
                  "get on top", "get on top of"],
                 "{Bobs} {need} to be entering something in particular.");

require_dobj_visible("entering");

actions.try_before.add_method({
  name: "move to parent enterable before entering",
  when: (action) => action.verb === "entering",
  handle: function (action) {
    this.next();
    if (world.location(world.actor) === action.dobj) {
      return;
    }
    var o;
    var actor_chain = [];
    o = world.actor;
    while (true) {
      o = world.parent_enterable(o);
      if (!o)
        break;
      actor_chain.push(o);
      if (world.is_a(o, "room"))
        break;
    }
    var obj_chain = [];
    o = action.dobj;
    while (true) {
      o = world.parent_enterable(o);
      if (!o) break;
      obj_chain.push(o);
      if (world.is_a(o, "room"))
        break;
    }
    // find common enterable
    var just_leave = false;
    found: {
      // maybe the actor_chain already contains the object
      for (let i = 0; i < actor_chain.length; i++) {
        if (actor_chain[i] === action.dobj) {
          just_leave = true;
          actor_chain.length = i;
          break found;
        }
      }
      for (let i = 0; i < obj_chain.length; i++) {
        for (let j = 0; j < actor_chain.length; j++) {
          if (obj_chain[i] === actor_chain[j]) {
            // truncate arrays to before common enterable
            actor_chain.length = j;
            obj_chain.length = i;
            break found;
          }
        }
      }
      // didn't find a common enterable
      throw new abort_action("{Bobs} {can't} get to that.");
    }
    // first leave things
    for (let i = 0; i < actor_chain.length; i++) {
      o = actor_chain[i];
      let a;
      if (world.is_a(o, "supporter")) {
        a = getting_off(o);
      } else {
        a = exiting(o);
      }
      if (i === actor_chain.length - 1 && just_leave) {
        // We're supposed to just leave because we're entering the dobj by leaving.
        throw new do_instead(a, true);
      } else {
        actions.do_first(a, {silently: true});
      }
    }
    // then enter things
    for (let i = obj_chain.length-1; i >=0; i--) {
      o = obj_chain[i];
      actions.do_first(entering(o), {silently: true});
    }
  }
});

actions.try_before.add_method({
  name: "entering door",
  when: (action) => action.verb === "entering" && world.is_a(action.dobj, "door"),
  handle: function (action) {
    for (var e of world.exits(world.containing_room(world.actor))) {
      if (e.obj === action.dobj) {
        throw new do_instead(going(e.tag), true);
      }
    }
    throw new abort_action("{Bobs} {can't} get to that.");
  }
});


actions.before.add_method({
  name: "entering default",
  when: (action) => action.verb === "entering",
  handle: function (action) {
    this.next();
    if (!world.enterable(action.dobj)) {
      throw new abort_action(world.no_enter_msg(action.dobj));
    }
  }
});

actions.before.add_method({
  name: "entering closed thing",
  when: (action) => (action.verb === "entering" && world.is_a(action.dobj, "container")
                     && world.enterable(action.dobj) && world.openable(action.dobj)
                     && !world.is_open(action.dobj)),
  handle: function (action) {
    actions.do_first(opening(action.dobj), {silently: true});
    if (!world.is_open(action.dobj)) {
      throw new abort_action("That needs to be open to be able to enter it.");
    }
    this.next();
  }
});

actions.before.add_method({
  name: "don't enter what already in",
  when: (action) => action.verb === "entering" && world.location(world.actor) === action.dobj,
  handle: function (action) {
    out.write("{Bobs} {are} already on "); out.the(action.dobj); out.write(".");
    throw new abort_action();
  }
});

actions.before.add_method({
  name: "don't enter what holding",
  when: (action) => action.verb === "entering" && world.owner(action.dobj) === world.actor,
  handle: function (action) {
    throw new abort_action("{Bobs} {can't} enter what {bobs} {are} holding.");
  }
});

actions.carry_out.add_method({
  name: "entering supporter or container",
  when: (action) => (action.verb === "entering" &&
                     (world.is_a(action.dobj, "container") || world.is_a(action.dobj, "supporter"))),
  handle: function (action) {
    world.put_in(world.actor, action.dobj);
  }
});

actions.report.add_method({
  name: "entering container",
  when: (action) => action.verb === "entering" && world.is_a(action.dobj, "container"),
  handle: function (action) {
    out.write("{Bobs} {get} into "); out.the(action.dobj); out.write(".");
  }
});

actions.report.add_method({
  name: "entering supporter",
  when: (action) => action.verb === "entering" && world.is_a(action.dobj, "supporter"),
  handle: function (action) {
    out.write("{Bobs} {get} onto "); out.the(action.dobj); out.write(".");
  }
});

actions.report.add_method({
  name: "entering give locale description",
  when: (action) => action.verb === "entering",
  handle: function (action) {
    this.next();
    out.para();
    out.write(world.locale_description(action.dobj));
  }
});

//// Exiting

function exiting(/*opt*/x) {
  return {verb: "exiting", dobj: x, setup: arguments.length>0};
}
def_verb("exiting", "exit", "exiting");

parser.action.understand("exit/leave", (parse) => exiting());
parser.action.understand("get out", (parse) => exiting());
parser.action.understand("exit/leave [something x]", (parse) => exiting(parse.x));
parser.action.understand("get out of [something x]", (parse) => exiting(parse.x));

actions.setup_action.add_method({
  name: "exiting",
  when: (action) => action.verb === "exiting",
  handle: function (action) {
    if (!action.setup) {
      action.setup = true;
      action.dobj = world.location(world.actor);
    }
  }
});

actions.verify.add_method({
  name: "exiting should be container or supporter",
  when: (action) => action.verb === "exiting",
  handle: function (action) {
    actions.setup_action(action);
    if (!world.is_a(action.dobj, "container") && !world.is_a(action.dobj, "supporter")
        && !world.is_a(action.dobj, "room")) {
      return verification.join(this.next(),
                               illogical_action("That's not something {bobs} can exit."));
    } else {
      return this.next();
    }
  }
});

actions.verify.add_method({
  name: "exiting should leave what one is in",
  when: (action) => action.verb === "exiting",
  handle: function (action) {
    actions.setup_action(action);
    if (world.location(world.actor) !== action.dobj) {
      return verification.join(this.next(),
                               illogical_action("{Bobs} {are} not in that."));
    } else {
      return this.next();
    }
  }
});

actions.try_before.add_method({
  name: "exiting supporter",
  when: (action) => action.verb === "exiting",
  handle: function (action) {
    this.next();
    actions.setup_action(action);
    if (world.is_a(action.dobj, "supporter")) {
      throw new do_instead(getting_off(action.dobj));
    }
  }
});

actions.try_before.add_method({
  name: "exiting room",
  when: (action) => action.verb === "exiting",
  handle: function (action) {
    this.next();
    actions.setup_action(action);
    if (world.is_a(action.dobj, "room")) {
      let exits = world.exits(action.dobj);
      if (exits.length === 1) {
        throw new do_instead(going(exits[0].tag));
      }
      throw new do_instead(going("out"));
    }
  }
});

actions.before.add_method({
  name: "exiting non-container",
  when: (action) => action.verb === "exiting",
  handle: function (action) {
    this.next();
    actions.setup_action(action);
    if (world.is_a(action.dobj, "room")) {
      throw new abort_action("There's nothing to exit.");
    }
    if (!world.is_a(action.dobj, "container")) {
      out.write("{Bobs} {can't} exit "); out.the(action.dobj); out.write(".");
      throw new abort_action();
    }
  }
});

actions.before.add_method({
  name: "exiting needs destination",
  when: (action) => action.verb === "exiting",
  handle: function (action) {
    this.next();
    actions.setup_action(action);
    if (!world.parent_enterable(action.dobj)) {
      // This really should never happen.
      throw new abort_action("There's nowhere to exit to.");
    }
  }
});

actions.before.add_method({
  name: "exiting closed thing",
  when: (action) => (action.verb === "exiting" && world.is_a(action.dobj, "container")
                     && world.enterable(action.dobj) && world.openable(action.dobj)
                     && !world.is_open(action.dobj)),
  handle: function (action) {
    this.next();
    actions.do_first(opening(action.dobj), {silently: true});
    if (!world.is_open(action.dobj)) {
      throw new abort_action("That needs to be open in order to exit it.");
    }
  }
});

actions.carry_out.add_method({
  name: "exiting",
  when: (action) => action.verb === "exiting",
  handle: function (action) {
    actions.setup_action(action);
    world.put_in(world.actor, world.parent_enterable(action.dobj));
  }
});

actions.report.add_method({
  name: "exiting",
  when: (action) => action.verb === "exiting",
  handle: function (action) {
    out.write("{Bobs} {get} out of "); out.the(action.dobj); out.write(".");
  }
});


//// Getting off

function getting_off(/*opt*/x) {
  return {verb: "getting off", dobj: x, setup: arguments.length>0};
}
def_verb("getting off", "get off", "getting off");

parser.action.understand("get off", (parse) => getting_off());
parser.action.understand("climb/get down", (parse) => getting_off());
parser.action.understand("stand/get up", (parse) => getting_off());

parser.action.understand("get/climb off [something x]", (parse) => getting_off(parse.x));
parser.action.understand("get/climb off of [something x]", (parse) => getting_off(parse.x));

actions.setup_action.add_method({
  name: "getting off",
  when: (action) => action.verb === "getting off",
  handle: function (action) {
    if (!action.setup) {
      action.setup = true;
      action.dobj = world.location(world.actor);
    }
  }
});

actions.verify.add_method({
  name: "getting off should be container or supporter",
  when: (action) => action.verb === "getting off",
  handle: function (action) {
    actions.setup_action(action);
    if (!world.is_a(action.dobj, "container") && !world.is_a(action.dobj, "supporter")) {
      return verification.join(this.next(),
                               illogical_action("That's not something {bobs} can get off."));
    } else {
      return this.next();
    }
  }
});

actions.verify.add_method({
  name: "should get off what one is in",
  when: (action) => action.verb === "getting off",
  handle: function (action) {
    actions.setup_action(action);
    if (world.location(world.actor) !== action.dobj) {
      return verification.join(this.next(),
                               illogical_action("{Bobs} {are} not on that."));
    } else {
      return this.next();
    }
  }
});

actions.try_before.add_method({
  name: "getting off container",
  when: (action) => action.verb === "getting off",
  handle: function (action) {
    this.next();
    actions.setup_action(action);
    if (world.is_a(action.dobj, "container")) {
      throw new do_instead(exiting(action.dobj));
    }
  }
});

actions.before.add_method({
  name: "getting off non-supporter",
  when: (action) => action.verb === "getting off",
  handle: function (action) {
    this.next();
    actions.setup_action(action);
    if (world.is_a(action.dobj, "room")) {
      throw new abort_action("There's nothing to get off of.");
    }
    if (!world.is_a(action.dobj, "supporter")) {
      out.write("{Bobs} {can't} get off of "); out.the(action.dobj); out.write(".");
      throw new abort_action();
    }
  }
});

actions.before.add_method({
  name: "getting off needs destination",
  when: (action) => action.verb === "getting off",
  handle: function (action) {
    this.next();
    actions.setup_action(action);
    if (!world.parent_enterable(action.dobj)) {
      // This really should never happen.
      throw new abort_action("There's nowhere to get off to.");
    }
  }
});

actions.carry_out.add_method({
  name: "getting off",
  when: (action) => action.verb === "getting off",
  handle: function (action) {
    actions.setup_action(action);
    world.put_in(world.actor, world.parent_enterable(action.dobj));
  }
});

actions.report.add_method({
  name: "getting off",
  when: (action) => action.verb === "getting off",
  handle: function (action) {
    out.write("{Bobs} {get} off of "); out.the(action.dobj); out.write(".");
  }
});

//// Opening

function opening(x) {
  return {verb: "opening", dobj: x};
}
def_verb("opening", "open", "opening");

/* This is anything instead of something because we need to be able to
refer to a box we're in even if there's no light! */
parser.action.understand("open [anything x]", parse => opening(parse.x));

all_are_mistakes(["open"],
                 "{Bobs} {need} to be opening something in particular.");

require_dobj_accessible("opening");

actions.verify.add_method({
  name: "opening closed openable",
  when: (action) => action.verb === "opening" && world.openable(action.dobj) && !world.is_open(action.dobj),
  handle: function (action) {
    return verification.join(this.next(), very_logical_action());
  }
});

actions.verify.add_method({
  name: "opening openable",
  when: (action) => action.verb === "opening" && world.openable(action.dobj),
  handle: function (action) {
    return verification.join(this.next(), logical_action());
  }
});

actions.verify.add_method({
  name: "can't open what is not accessible, unless we're in it",
  when: (action) => action.verb === "opening" && !world.accessible_to(action.dobj, world.actor),
  handle: function (action) {
    var reason = illogical_not_visible("{Bobs} {can} see no such thing.");
    return verification.join(this.next(), reason);
  }
});

actions.before.add_method({
  name: "can't open unopenable",
  when: (action) => action.verb === "opening" && !world.openable(action.dobj),
  handle: function (action) {
    this.next();
    throw new abort_action(world.no_open_msg(action.dobj, "no_open"));
  }
});

actions.before.add_method({
  name: "can't open already open",
  when: (action) => (action.verb === "opening" && world.openable(action.dobj)
                     && world.is_open(action.dobj)),
  handle: function (action) {
    this.next();
    throw new abort_action(world.no_open_msg(action.dobj, "already_open"));
  }
});

actions.before.add_method({
  name: "can't open locked",
  when: (action) => action.verb === "opening" && world.lockable(action.dobj) && world.is_locked(action.dobj),
  handle: function (action) {
    this.next();
    throw new abort_action(world.no_lock_msg(action.dobj, "no_open"));
  }
});

actions.carry_out.add_method({
  name: "open default",
  when: (action) => action.verb === "opening",
  handle: function (action) {
    world.is_open.set(action.dobj, true);
  }
});

actions.report.add_method({
  name: "open default",
  when: (action) => action.verb === "opening",
  handle: function (action) {
    out.write("You open "); out.the(action.dobj);
    if (world.is_a(action.dobj, "container")) {
      var contents = world.contents(action.dobj).filter(c => c !== world.actor && world.reported(c));
      if (contents.length) {
        out.write(" revealing ");
        out.serial_comma(contents);
      }
    }
    out.write(".");
  }
});

//// Closing

function closing(x) {
  return {verb: "closing", dobj: x};
}
def_verb("closing", "close", "closing");

parser.action.understand("close [something x]", parse => closing(parse.x));

all_are_mistakes(["close"],
                 "{Bobs} {need} to be closing something in particular.");

require_dobj_accessible("closing");

actions.verify.add_method({
  name: "closing open openable",
  when: (action) => action.verb === "closing" && world.openable(action.dobj) && world.is_open(action.dobj),
  handle: function (action) {
    return verification.join(this.next(), very_logical_action());
  }
});

actions.verify.add_method({
  name: "closing openable",
  when: (action) => action.verb === "closing" && world.openable(action.dobj),
  handle: function (action) {
    return verification.join(this.next(), logical_action());
  }
});

actions.before.add_method({
  name: "can't close unopenable",
  when: (action) => action.verb === "closing" && !world.openable(action.dobj),
  handle: function (action) {
    this.next();
    throw new abort_action(world.no_open_msg(action.dobj, "no_close"));
  }
});

actions.before.add_method({
  name: "can't close already closed",
  when: (action) => (action.verb === "closing" && world.openable(action.dobj)
                     && !world.is_open(action.dobj)),
  handle: function (action) {
    this.next();
    throw new abort_action(world.no_open_msg(action.dobj, "already_closed"));
  }
});

actions.carry_out.add_method({
  name: "closing default",
  when: (action) => action.verb === "closing",
  handle: function (action) {
    world.is_open.set(action.dobj, false);
  }
});

actions.report.add_method({
  name: "close default",
  when: (action) => action.verb === "closing",
  handle: function (action) {
    out.write("You close "); out.the(action.dobj); out.write(".");
  }
});

//// Unlocking with

function unlocking_with(x, y) {
  return {verb: "unlocking with", dobj: x, iobj: y};
}
def_verb("unlocking with", "unlock", "unlocking", "with");

parser.action.understand("unlock/open [something x] with [something y]",
                         parse => unlocking_with(parse.x, parse.y));

all_are_mistakes(["unlock"], "{Bobs} {need} to be unlocking something in particular");

require_dobj_accessible("unlocking with");
require_iobj_held("unlocking with");

actions.before.add_method({
  name: "unlocking not lockable with",
  when: action => action.verb === "unlocking with" && !world.lockable(action.dobj),
  handle: function (action) {
    throw new abort_action(world.no_lock_msg(action.dobj, "no_unlock"));
  }
});
actions.before.add_method({
  name: "unlocking with wrong key",
  when: action => (action.verb === "unlocking with" && world.lockable(action.dobj)
                   && !world.key_of_lock(action.iobj, action.dobj)),
  handle: function (action) {
    throw new abort_action(world.wrong_key_msg(action.iobj, action.dobj));
  }
});
actions.before.add_method({
  name: "unlocking already unlocked with",
  when: action => (action.verb === "unlocking with" && world.lockable(action.dobj)
                   && !world.is_locked(action.dobj)),
  handle: function (action) {
    throw new abort_action(world.no_lock_msg(action.dobj, "already_unlocked"));
  }
});

actions.carry_out.add_method({
  name: "unlocking with",
  when: action => action.verb === "unlocking with",
  handle: function (action) {
    world.is_locked.set(action.dobj, false);
  }
});

actions.report.add_method({
  name: "unlocking with",
  when: action => action.verb === "unlocking with",
  handle: function (action) {
    out.write("Unlocked.");
  }
});

//// Unlocking

/* This verb is mainly to give a hint that you need a key. */

function unlocking(x) {
  return {verb: "unlocking", dobj: x};
}
def_verb("unlocking", "unlock", "unlocking");

parser.action.understand("unlock [something x]", parse => unlocking(parse.x));

require_dobj_accessible("unlocking");

actions.before.add_method({
  name: "unlocking not lockable",
  when: action => action.verb === "unlocking" && !world.lockable(action.dobj),
  handle: function (action) {
    throw new abort_action(world.no_lock_msg(action.dobj, "no_unlock"));
  }
});
actions.before.add_method({
  name: "unlocking default",
  when: action => action.verb === "unlocking" && world.lockable(action.dobj),
  handle: function (action) {
    throw new abort_action("{Bobs} {need} to be unlocking that with a key.");
  }
});

//// Locking with

function locking_with(x, y) {
  return {verb: "locking with", dobj: x, iobj: y};
}
def_verb("locking with", "lock", "locking", "with");

parser.action.understand("lock/close [something x] with [something y]",
                         parse => locking_with(parse.x, parse.y));

all_are_mistakes(["lock"], "{Bobs} {need} to be locking something in particular");

require_dobj_accessible("locking with");
require_iobj_held("locking with");

actions.before.add_method({
  name: "locking not lockable with",
  when: action => action.verb === "locking with" && !world.lockable(action.dobj),
  handle: function (action) {
    throw new abort_action(world.no_lock_msg(action.dobj, "no_lock"));
  }
});
actions.before.add_method({
  name: "locking with wrong key",
  when: action => (action.verb === "locking with" && world.lockable(action.dobj)
                   && !world.key_of_lock(action.iobj, action.dobj)),
  handle: function (action) {
    throw new abort_action(world.wrong_key_msg(action.iobj, action.dobj));
  }
});
actions.before.add_method({
  name: "locking already locked with",
  when: action => (action.verb === "locking with" && world.lockable(action.dobj)
                   && world.is_locked(action.dobj)),
  handle: function (action) {
    throw new abort_action(world.no_lock_msg(action.dobj, "already_locked"));
  }
});

actions.carry_out.add_method({
  name: "locking with",
  when: action => action.verb === "locking with",
  handle: function (action) {
    world.is_locked.set(action.dobj, true);
  }
});

actions.report.add_method({
  name: "locking with",
  when: action => action.verb === "locking with",
  handle: function (action) {
    out.write("Locked.");
  }
});

//// Locking

/* This verb is mainly to give a hint that you need a key. */

function locking(x) {
  return {verb: "locking", dobj: x};
}
def_verb("locking", "lock", "locking");

parser.action.understand("lock [something x]", parse => locking(parse.x));

require_dobj_accessible("locking");

actions.before.add_method({
  name: "locking not lockable",
  when: action => action.verb === "locking" && !world.lockable(action.dobj),
  handle: function (action) {
    throw new abort_action(world.no_lock_msg(action.dobj, "no_lock"));
  }
});
actions.before.add_method({
  name: "locking default",
  when: action => action.verb === "locking" && world.lockable(action.dobj),
  handle: function (action) {
    throw new abort_action("{Bobs} {need} to be locking that with a key.");
  }
});

//// Wearing

function wearing(x) {
  return {verb: "wearing", dobj: x};
}
def_verb("wearing", "wear", "wearing");

parser.action.understand("wear [something x]", parse => wearing(parse.x));
parser.action.understand("put on [something x]", parse => wearing(parse.x));
parser.action.understand("put [something x] on", parse => wearing(parse.x));

all_are_mistakes(["wear", "put on"],
                 "{Bobs} {need} to be putting on something in particular.");

require_dobj_held("wearing");

actions.verify.add_method({
  name: "wearing not worn",
  when: (action) => action.verb === "wearing" && world.location(action.dobj, "worn_by") !== world.actor,
  handle: function (action) {
    return verification.join(this.next(), very_logical_action());
  }
});

actions.before.add_method({
  name: "wearing not wearable",
  when: action => action.verb === "wearing" && !world.wearable(action.dobj),
  handle: function (action) {
    out.The(action.dobj); out.write(" can't be worn.");
    throw new abort_action();
  }
});
actions.carry_out.add_method({
  name: "wearing",
  when: action => action.verb === "wearing",
  handle: function (action) {
    world.make_wear(world.actor, action.dobj);
  }
});
actions.report.add_method({
  name: "wearing",
  when: action => action.verb === "wearing",
  handle: function (action) {
    out.write("{Bobs} now {wear} "); out.the(action.dobj); out.write(".");
  }
});

//// Taking off

function taking_off(x) {
  return {verb: "taking off", dobj: x};
}
def_verb("taking off", "take", "taking", "off");

parser.action.understand("take off [something x]", parse => taking_off(parse.x));
parser.action.understand("take [something x] off", parse => taking_off(parse.x));
parser.action.understand("remove [something x]", parse => taking_off(parse.x));

all_are_mistakes(["take off"],
                 "{Bobs} {need} to be taking off something in particular.");

actions.verify.add_method({
  name: "taking off worn",
  when: (action) => action.verb === "taking off" && world.location(action.dobj, "worn_by") === world.actor,
  handle: function (action) {
    return verification.join(this.next(), very_logical_action());
  }
});
actions.before.add_method({
  name: "taking off not worn",
  when: action => action.verb === "taking off" && world.location(action.dobj, "worn_by") !== world.actor,
  handle: function (action) {
    throw new abort_action("{Bobs} {are} not wearing that.");
  }
});
actions.carry_out.add_method({
  name: "taking off",
  when: action => action.verb === "taking off",
  handle: function (action) {
    world.give_to(action.dobj, world.actor);
  }
});
actions.report.add_method({
  name: "taking off",
  when: action => action.verb === "taking off",
  handle: function (action) {
    out.write("{Bobs} {take} off "); out.the(action.dobj); out.write(".");
  }
});

//// Switching on

function switching_on(x) {
  return {verb: "switching on", dobj: x};
}
def_verb("switching on", "switch on", "switching on");

parser.action.understand("switch/turn on [something x]", parse => switching_on(parse.x));
parser.action.understand("switch/turn [something x] on", parse => switching_on(parse.x));

all_are_mistakes(["switch/turn on"],
                 "{Bobs} {need} to be switching on something in particular.");

require_dobj_accessible("switching on");

actions.verify.add_method({
  name: "switching on switched off",
  when: (action) => (action.verb === "switching on" && world.switchable(action.dobj)
                     && !world.is_switched_on(action.dobj)),
  handle: function (action) {
    return verification.join(this.next(), very_logical_action());
  }
});

actions.verify.add_method({
  name: "switching on switchable",
  when: (action) => action.verb === "switching on" && world.switchable(action.dobj),
  handle: function (action) {
    return verification.join(this.next(), logical_action());
  }
});

actions.before.add_method({
  name: "can't switch on unswitchable",
  when: (action) => action.verb === "switching on" && !world.switchable(action.dobj),
  handle: function (action) {
    this.next();
    throw new abort_action(world.no_switch_msg(action.dobj, "no_switch_on"));
  }
});

actions.before.add_method({
  name: "can't switch on already on",
  when: (action) => (action.verb === "switching on" && world.switchable(action.dobj)
                     && world.is_switched_on(action.dobj)),
  handle: function (action) {
    this.next();
    throw new abort_action(world.no_switch_msg(action.dobj, "already_on"));
  }
});

actions.carry_out.add_method({
  name: "switching on default",
  when: (action) => action.verb === "switching on",
  handle: function (action) {
    world.is_switched_on.set(action.dobj, true);
  }
});

actions.report.add_method({
  name: "switching on default",
  when: (action) => action.verb === "switching on",
  handle: function (action) {
    out.write("Switched on.");
  }
});

//// Switching off

function switching_off(x) {
  return {verb: "switching off", dobj: x};
}
def_verb("switching off", "switch off", "switching off");

parser.action.understand("switch/turn off [something x]", parse => switching_off(parse.x));
parser.action.understand("switch/turn [something x] off", parse => switching_off(parse.x));

all_are_mistakes(["switch/turn off"],
                 "{Bobs} {need} to be switching off something in particular.");

require_dobj_accessible("switching off");

actions.verify.add_method({
  name: "switching off switched on",
  when: (action) => (action.verb === "switching off" && world.switchable(action.dobj)
                     && world.is_switched_on(action.dobj)),
  handle: function (action) {
    return verification.join(this.next(), very_logical_action());
  }
});

actions.verify.add_method({
  name: "switching off switchable",
  when: (action) => action.verb === "switching off" && world.switchable(action.dobj),
  handle: function (action) {
    return verification.join(this.next(), logical_action());
  }
});

actions.before.add_method({
  name: "can't switch off unswitchable",
  when: (action) => action.verb === "switching off" && !world.switchable(action.dobj),
  handle: function (action) {
    this.next();
    throw new abort_action(world.no_switch_msg(action.dobj, "no_switch_off"));
  }
});

actions.before.add_method({
  name: "can't switch off already off",
  when: (action) => (action.verb === "switching off" && world.switchable(action.dobj)
                     && !world.is_switched_on(action.dobj)),
  handle: function (action) {
    this.next();
    throw new abort_action(world.no_switch_msg(action.dobj, "already_off"));
  }
});

actions.carry_out.add_method({
  name: "switching off default",
  when: (action) => action.verb === "switching off",
  handle: function (action) {
    world.is_switched_on.set(action.dobj, false);
  }
});

actions.report.add_method({
  name: "switching off default",
  when: (action) => action.verb === "switching off",
  handle: function (action) {
    out.write("Switched off.");
  }
});

//// Switching

function switching(x) {
  return {verb: "switching", dobj: x};
}
def_verb("switching", "switch", "switching");

parser.action.understand("switch/turn/toggle [something x]", parse => switching(parse.x));

all_are_mistakes(["switch/turn/toggle"],
                 "{Bobs} {need} to be toggling something in particular.");

require_dobj_accessible("switching");

actions.verify.add_method({
  name: "switching switchable",
  when: (action) => action.verb === "switching" && world.switchable(action.dobj),
  handle: function (action) {
    return verification.join(this.next(), very_logical_action());
  }
});

actions.before.add_method({
  name: "switching unswitchable",
  when: (action) => action.verb === "switching" && !world.switchable(action.dobj),
  handle: function (action) {
    this.next();
    throw new abort_action(world.no_switch_msg(action.dobj, "no_switch"));
  }
});

actions.before.add_method({
  name: "switching switchable",
  when: (action) => action.verb === "switching" && world.switchable(action.dobj),
  handle: function (action) {
    this.next();
    if (world.is_switched_on(action.dobj)) {
      throw new do_instead(switching_off(action.dobj), true);
    } else {
      throw new do_instead(switching_on(action.dobj), true);
    }
  }
});


//// Using

/* Generic interaction with a thing. */

function using(x) {
  return {verb: "using", dobj: x};
}
def_verb("using", "use", "using");

parser.action.understand("use [something x]", parse => using(parse.x));

all_are_mistakes(["use"],
                 "{Bobs} {need} to be using something in particular.");

require_dobj_accessible("using");

actions.before.add_method({
  name: "using default",
  when: action => action.verb === "using",
  handle: function (action) {
    throw new abort_action("{Bobs} {aren't} sure how to use that.");
  }
});

// The following are in an arbitrary order

actions.before.add_method({
  name: "using enterable",
  when: action => action.verb === "using" && world.enterable(action.dobj),
  handle: function (action) {
    throw new do_instead(entering(action.dobj));
  }
});

actions.before.add_method({
  name: "using open openable",
  when: action => (action.verb === "using" && world.openable(action.dobj)
                   && world.is_open(action.dobj)),
  handle: function (action) {
    throw new do_instead(closing(action.dobj));
  }
});

actions.before.add_method({
  name: "using closed openable",
  when: action => (action.verb === "using" && world.openable(action.dobj)
                   && !world.is_open(action.dobj)),
  handle: function (action) {
    throw new do_instead(opening(action.dobj));
  }
});

actions.before.add_method({
  name: "using switchable",
  when: action => action.verb === "using" && world.switchable(action.dobj),
  handle: function (action) {
    throw new do_instead(switching(action.dobj));
  }
});

//// Eating

function eating(x) {
  return {verb: "eating", dobj: x};
}
def_verb("eating", "eat", "eating");

parser.action.understand("eat [something x]", parse => eating(parse.x));

all_are_mistakes(["eat"], "{Bobs} {need} to be eating something in particular.");

require_dobj_held("eating");

actions.before.add_method({
  name: "eating inedible",
  when: action => action.verb === "eating" && !world.edible(action.dobj),
  handle: function (action) {
    throw new abort_action("{Bobs} {don't} feel like eating that.");
  }
});

actions.carry_out.add_method({
  name: "eating default",
  when: action => action.verb === "eating",
  handle: function (action) {
    world.remove_obj(action.dobj);
  }
});

actions.report.add_method({
  name: "eating default",
  when: action => action.verb === "eating",
  handle: function (action) {
    out.write("{Bobs} {eat} ", world.definite_name(action.dobj), ".");
  }
});

//// Attacking

function attacking(x) {
  return {verb: "attacking", dobj: x};
}
def_verb("attacking", "attack", "attacking");

parser.action.understand("attack/kill [something x]", parse => attacking(parse.x));

all_are_mistakes(["attack/kill"], "{Bobs} {need} to be attacking something or someone in particular.");

require_dobj_accessible("attacking");

actions.before.add_method({
  name: "attacking default",
  when: action => action.verb === "attacking",
  handle: function (action) {
    throw new abort_action("Violence isn't the answer to this one.");
  }
});

//// Climbing

function climbing(x) {
  return {verb: "climbing", dobj: x};
}
def_verb("climbing", "climb", "climbing");

parser.action.understand("climb [something x]", parse => climbing(parse.x));

all_are_mistakes(["climb"], "{Bobs} {need} to be climbing something in particular.");

require_dobj_accessible("climbing");

actions.before.add_method({
  name: "climbing default",
  when: action => action.verb === "climbing",
  handle: function (action) {
    out.write("{Bobs} {can't} climb "); out.the(action.dobj); out.write(".");
  }
});

//// Waiting

function waiting() {
  return {verb: "waiting"};
}
def_verb("waiting", "wait", "waiting");

parser.action.understand("wait/z", parse => waiting());

actions.report.add_method({
  name: "waiting",
  when: action => action.verb === "waiting",
  handle: function (action) {
    out.write("Time passes.");
  }
});

//// Greeting

function greeting() {
  return {verb: "greeting"};
}
def_verb("greeting", "greet", "greeting");

parser.action.understand("greet/hi/hello", parse => greeting());

actions.report.add_method({
  name: "greeting",
  when: action => action.verb === "greeting",
  handle: function (action) {
    out.write("{Bobs} {say} hi.");
  }
});

//// Jumping

function jumping() {
  return {verb: "jumping"};
}
def_verb("jumping", "jump", "jumping");

parser.action.understand("jump", parse => jumping());

actions.report.add_method({
  name: "jumping",
  when: action => action.verb === "jumping",
  handle: function (action) {
    out.write("{Bobs} {jump} in place.");
  }
});

//// Singing

function singing() {
  return {verb: "singing"};
}
def_verb("singing", "sing", "singing");

parser.action.understand("sing", parse => singing());

actions.report.add_method({
  name: "singing",
  when: action => action.verb === "singing",
  handle: function (action) {
    out.write("{Bobs} {sing} to {ourself} quietly.");
  }
});

//// Laughing

function laughing() {
  return {verb: "laughing"};
}
def_verb("laughing", "laugh", "laughing");

parser.action.understand("laugh/lol/ha/haha/hahaha/hahahaha", parse => laughing());

actions.report.add_method({
  name: "laughing",
  when: action => action.verb === "laughing",
  handle: function (action) {
    out.write("{Bobs} {laugh} to {ourself} quietly.");
  }
});

//// Asking about

function asking_about(x, y) {
  return {verb: "asking about", dobj: x, text: y};
}
actions.write_gerund_form.add_method({
  when: (action) => action.verb === "asking about",
  handle: function (action) {
    out.write("asking "); out.the(action.dobj); out.write(" about ");
    out.write_text(action.text);
  }
});
actions.write_infinitive_form.add_method({
  when: (action) => action.verb === "asking about",
  handle: function (action) {
    out.write("ask "); out.the(action.dobj); out.write(" about ");
    out.write_text(action.text);
  }
});

parser.action.understand("ask/consult [something x] about [text y]",
                         parse => asking_about(parse.x, parse.y));

require_dobj_accessible("asking about");

actions.report.add_method({
  name: "asking about default",
  when: action => action.verb === "asking about",
  handle: function (action) {
    out.The(action.dobj); out.write(" has nothing to say about that.");
  }
});
