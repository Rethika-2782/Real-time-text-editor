import React from "react";
import "./Header.css";

const Header = ({ userCount }) => {
  return (
    <header className="header">
      <h1>Real-Time Collaborative Editor</h1>
      <p>Users Online: {userCount}</p>
    </header>
  );
};

export default Header;