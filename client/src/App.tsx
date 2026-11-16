import { Route, Routes } from 'react-router-dom';
import { Home } from './pages/Home';
import { PartEditor } from './pages/PartEditor';
import { SetupEditor } from './pages/SetupEditor';
import { UploadWizard } from './pages/UploadWizard';

export function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/setups/:id" element={<SetupEditor />} />
      <Route path="/s/:token" element={<SetupEditor shared />} />
      <Route path="/parts/new" element={<UploadWizard />} />
      <Route path="/parts/:id" element={<PartEditor />} />
      <Route path="*" element={<Home />} />
    </Routes>
  );
}
