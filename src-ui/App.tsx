import React, { useState } from "react";
import classbotLogo from "./assets/classbot.png";
import "./App.css";

function App() {
  const [count, setCount] = useState(0);

  return (
    <div className="App">
      <div>
        <a href="https://github.com/clusterhack/github-classbot" target="_blank" rel="noreferrer">
          <img src={classbotLogo} className="logo" alt="Vite logo" />
        </a>
      </div>
      <h1>ClassBot</h1>
      <div className="card">
        <button onClick={() => setCount(count => count + 1)}>Count is {count}</button>
        <p>
          Edit <code>src/App.tsx</code> and save to test HMR
        </p>
      </div>
    </div>
  );
}

export default App;
