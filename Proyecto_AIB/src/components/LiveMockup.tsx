import React from 'react';
import { Sandpack } from '@codesandbox/sandpack-react';

interface Props {
  code: string;
}

export const LiveMockup: React.FC<Props> = ({ code }) => {
  return (
    <div className="live-mockup-container">
      <h3>Prototipo Interactivo Generado</h3>
      <p className="subtitle">Explora y prueba la interfaz básica generada por IA</p>
      
      <Sandpack
        template="react"
        theme="dark"
        files={{
          '/App.js': code,
        }}
        options={{
          showNavigator: true,
          showTabs: false,
          editorHeight: 500,
        }}
      />

      <style>{`
        .live-mockup-container {
          margin-top: 32px;
          padding: 24px;
          background: #0f172a;
          border-radius: 16px;
          border: 1px solid #1e293b;
          color: white;
        }
        .live-mockup-container h3 {
          margin-top: 0;
          color: #38bdf8;
        }
        .subtitle {
          color: #94a3b8;
          margin-bottom: 20px;
        }
      `}</style>
    </div>
  );
};
