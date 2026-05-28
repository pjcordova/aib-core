import React, { useState, useEffect } from "react";

interface Props {
  mockupPath: string;
  diagramaPath: string;
}

export const PrevisualizacionVisual: React.FC<Props> = ({ mockupPath, diagramaPath }) => {
  const [mockupOk, setMockupOk] = useState<boolean>(true);
  const [diagramaOk, setDiagramaOk] = useState<boolean>(true);

  useEffect(() => {
    // Validar existencia del mockup
    fetch(mockupPath)
      .then((res) => {
        if (!res.ok) setMockupOk(false);
      })
      .catch(() => setMockupOk(false));

    // Validar existencia del diagrama
    fetch(diagramaPath)
      .then((res) => {
        if (!res.ok) setDiagramaOk(false);
      })
      .catch(() => setDiagramaOk(false));
  }, [mockupPath, diagramaPath]);

  return (
    <div style={{ marginTop: "20px" }}>
      <h3>Artefactos visuales</h3>

      <div style={{ marginBottom: "16px" }}>
        <strong>Mockup:</strong>
        {mockupOk ? (
          <img src={mockupPath} alt="Mockup generado" style={{ maxWidth: "100%", marginTop: "8px" }} />
        ) : (
          <p style={{ color: "gray" }}>Imagen no disponible</p>
        )}
      </div>

      <div>
        <strong>Diagrama:</strong>
        {diagramaOk ? (
          <img src={diagramaPath} alt="Diagrama generado" style={{ maxWidth: "100%", marginTop: "8px" }} />
        ) : (
          <p style={{ color: "gray" }}>Imagen no disponible</p>
        )}
      </div>
    </div>
  );
};
