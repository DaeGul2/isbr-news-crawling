import React from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import Dashboard from "./pages/Dashboard";
import Detail from "./pages/Detail";
import "bootstrap/dist/css/bootstrap.min.css"; // Bootstrap 스타일 적용

const App = () => {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/detail" element={<Detail />} />
      </Routes>
    </Router>
  );
};

export default App;
