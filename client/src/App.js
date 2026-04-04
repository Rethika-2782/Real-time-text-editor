import React, { useEffect, useState, useRef } from "react";
import io from "socket.io-client";
import Header from "./components/Header";
import "./App.css";

const socket = io(); // <-- remove URL, will connect to same origin

function App() {
  const [text, setText] = useState("");
  const [users, setUsers] = useState(0);
  const [cursors, setCursors] = useState({});
  const textareaRef = useRef(null);

  useEffect(() => {
    socket.on("load-document", setText);
    socket.on("text-change", setText);
    socket.on("users", setUsers);

    socket.on("cursor-change", ({ id, position }) => {
      setCursors(prev => ({ ...prev, [id]: position }));
    });

    socket.on("cursor-remove", (id) => {
      setCursors(prev => {
        const newCursors = { ...prev };
        delete newCursors[id];
        return newCursors;
      });
    });

    return () => {
      socket.off("load-document");
      socket.off("text-change");
      socket.off("users");
      socket.off("cursor-change");
      socket.off("cursor-remove");
    };
  }, []);

  const handleChange = (e) => {
    setText(e.target.value);
    socket.emit("text-change", e.target.value);
  };

  const handleCursor = () => {
    const position = textareaRef.current.selectionStart;
    socket.emit("cursor-change", position);
  };

  return (
    <div className="app-container">
      <Header userCount={users} />
      <textarea
        ref={textareaRef}
        value={text}
        onChange={handleChange}
        onSelect={handleCursor}
        onKeyUp={handleCursor}
        rows={20}
        cols={80}
        placeholder="Start collaborating..."
        className="editor-textarea"
      />
      {/* Cursor overlay can be added later if needed */}
    </div>
  );
}

export default App;
