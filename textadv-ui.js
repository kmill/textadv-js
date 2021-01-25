var command_history = [];
var command_index = 0;
var current_command = "";

function history_add(command) {
  if (command !== command_history[command_history.length - 1]) {
    command_history.push(command);
  }
  command_index = command_history.length;
  current_command = "";
};

function history_up() {
  if(command_index > 0) {
    if(command_index == command_history.length) {
      current_command = document.getElementById("command").value;
    }
    command_index -= 1;
    document.getElementById("command").value = command_history[command_index];
  }
};

function history_down() {
  if(command_index < command_history.length) {
    command_index += 1;
    if(command_index === command_history.length) {
      document.getElementById("command").value = current_command;
    } else {
      document.getElementById("command").value = command_history[command_index];
    }
  }
}

function enter_command() {
  var command = document.getElementById("command").value;
  run_action(command);
}

var run_action_callback = null;
function run_action(command) {
  history_add(command);
  out.with_block("p", () => {
    out.add_class("user_input");
    out.write_text("> " + command);
  });
  document.getElementById("command").value = "";
  var callback = run_action_callback;
  run_action_callback = null;
  callback(command);
  return false;
}

window.addEventListener("load", () => {
  document.body.addEventListener("click", (e) => {
    if (e.target === document.body) {
      document.getElementById("command").focus();
    }
  });

  document.getElementById("command").focus();
  document.getElementById("command").addEventListener("keydown", (e) => {
    if(e.keyCode == 38) {
      e.preventDefault();
      history_up();
    } else if(e.keyCode == 40) {
      e.preventDefault();
      history_down();
    }
  });

  document.body.addEventListener("click", function (e) {
    var node = e.target;
    var attr;
    while (node) {
      attr = node.getAttribute("data-action");
      if (attr) break;
      node = node.parentElement;
    }
    if (attr) {
      e.stopPropagation();
      e.preventDefault();
      run_action(attr);
    }
  });

  add_game_listener("input", (callback) => {
    var cmd = document.getElementById("command");
    cmd.focus();
    cmd.scrollIntoView(true);
    run_action_callback = callback;
  });
});
