import React, { useState, useEffect, useRef } from "react";
import "./Editor.css";

const Editor = ({ userCursors }) => {
  const [text, setText] = useState("");
  const editorRef = useRef(null);

  const handleChange = (e) => {
    setText(e.target.value);
  };

  return (
    <div className="editor-container">
      <textarea
        ref={editorRef}
        value={text}
        onChange={handleChange}
        placeholder="Start typing here..."
      />
      {userCursors.map((user, index) => (
        <div
          key={index}
          className="cursor"
          style={{
            left: `${user.position}px`,
            top: `${user.line * 20}px`,
            backgroundColor: user.color,
          }}
        >
          {user.name[0]}
        </div>
      ))}
    </div>
  );
};

export default Editor;