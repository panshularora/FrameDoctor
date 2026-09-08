import { HashRouter, Navigate, Route, Routes } from "react-router-dom";
import Phone from "./screens/Phone.jsx";
import Desk from "./screens/Desk.jsx";

export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<Phone />} />
        <Route path="/desk" element={<Desk />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </HashRouter>
  );
}
