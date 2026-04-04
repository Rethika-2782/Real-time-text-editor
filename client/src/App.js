// client/src/App.js
import React, { useEffect, useState, useRef } from "react";
import { io } from "socket.io-client"; // changed from default import
import Header from "./components/Header";
import "./App.css";

const SOCKET_URL = process.env.REACT_APP_SOCKET_URL || "http://localhost:5000";
const socket = io(SOCKET_URL);

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
        const copy = { ...prev };
        delete copy[id];
        return copy;
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

  const renderCursors = () => {
    if (!textareaRef.current) return null;
    const lines = text.split("\n");
    const elements = [];

    Object.entries(cursors).forEach(([id, pos], index) => {
      let total = 0;
      let lineIndex = 0;
      let colIndex = 0;

      for (let i = 0; i < lines.length; i++) {
        if (pos <= total + lines[i].length) {
          lineIndex = i;
          colIndex = pos - total;
          break;
        }
        total += lines[i].length + 1;
      }

      elements.push(
        <span
          key={id}
          style={{
            position: "absolute",
            left: `${colIndex * 8}px`,
            top: `${lineIndex * 20}px`,
            width: "2px",
            height: "18px",
            backgroundColor: `hsl(${(index * 90) % 360}, 70%, 50%)`,
            pointerEvents: "none",
          }}
        ></span>
      );
    });

    return elements;
  };

  return (
    <div className="app-container">
      <Header userCount={users} />
      <div className="editor-wrapper">
        <div className="editor-container">
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
          <div className="cursors-overlay">{renderCursors()}</div>
        </div>
      </div>
    </div>
  );
}

export default App;
