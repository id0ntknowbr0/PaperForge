/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect } from 'react';
import { StudioModule } from './components/StudioModule';

export default function App() {
  useEffect(() => {
    document.title = 'PaperForge';
  }, []);

  return (
    <div className="w-screen h-screen overflow-hidden bg-[#111318] text-[#F3F4F6]">
      <StudioModule />
    </div>
  );
}
