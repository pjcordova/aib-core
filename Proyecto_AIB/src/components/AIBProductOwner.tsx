import React, { useState, useEffect } from 'react';
import type { ProductOwnerResponse, QAHistory, AIBQuestion } from '../Types/productOwner';

interface Props {
  servicioInicial: string;
  onComplete: (historial: QAHistory[]) => void;
}

export const AIBProductOwner: React.FC<Props> = ({ servicioInicial, onComplete }) => {
  const [historial, setHistorial] = useState<QAHistory[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [poResponse, setPoResponse] = useState<ProductOwnerResponse | null>(null);
  const [currentQuestions, setCurrentQuestions] = useState<AIBQuestion[]>([]);
  const [textAnswers, setTextAnswers] = useState<Record<string, string>>({});

  useEffect(() => {
    // Initial request to get the first set of questions
    fetchQuestions(servicioInicial, []);
  }, [servicioInicial]);

  const fetchQuestions = async (servicio: string, currentHistory: QAHistory[]) => {
    setLoading(true);
    try {
      const res = await fetch('http://localhost:3001/api/generar-preguntas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ servicio, historial: currentHistory })
      });
      
      if (!res.ok) throw new Error('Network error from backend');
      
      const data: ProductOwnerResponse = await res.json();
      setPoResponse(data);
      
      if (data.is_complete) {
        // Transition to prototype generation phase
        setTimeout(() => {
          onComplete(currentHistory);
        }, 2000); // Brief delay for UX so they see the completion message
      } else if (data.questions) {
        setCurrentQuestions(data.questions);
      }
    } catch (error) {
      console.error('[AIBProductOwner] Fetch error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleOptionClick = (question: AIBQuestion, answer: string) => {
    const newHistoryEntry: QAHistory = {
      question_id: question.id,
      question: question.text,
      answer: answer
    };
    
    const nextHistory = [...historial, newHistoryEntry];
    setHistorial(nextHistory);
    
    // We assume sequential answering for multiple questions or sending them all at once.
    // If there are multiple questions in the current batch, we should ideally wait for all to be answered.
    // For simplicity, if there's only 1 question, we fetch next immediately.
    // If there are more, we filter out the answered one.
    
    const remainingQuestions = currentQuestions.filter(q => q.id !== question.id);
    if (remainingQuestions.length === 0) {
      // All questions in this batch answered, fetch next batch from AI
      setCurrentQuestions([]);
      fetchQuestions(servicioInicial, nextHistory);
    } else {
      setCurrentQuestions(remainingQuestions);
    }
  };

  const handleTextSubmit = (question: AIBQuestion) => {
    const answer = textAnswers[question.id];
    if (!answer || answer.trim() === '') return;
    
    handleOptionClick(question, answer);
  };

  if (poResponse?.is_complete) {
    return (
      <div className="po-container text-center">
        <h2 className="pulse-text">Generando prototipo visual...</h2>
        <p>El Product Owner ha recolectado toda la información necesaria.</p>
        <style>{`
          .pulse-text {
            animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
            color: #38bdf8;
          }
          @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: .5; }
          }
        `}</style>
      </div>
    );
  }

  return (
    <div className="po-container">
      <div className="chat-history">
        {historial.map((item, idx) => (
          <div key={idx} className="chat-bubble user-response">
            <span className="q-text">{item.question}</span>
            <span className="a-text">{item.answer}</span>
          </div>
        ))}
      </div>

      {loading ? (
        <div className="loading-skeleton pulse">
          <div className="skeleton-line" />
          <div className="skeleton-line short" />
          <div className="skeleton-box" />
        </div>
      ) : (
        <div className="active-questions">
          {currentQuestions.map(q => (
            <div key={q.id} className="question-card">
              <h3>{q.text}</h3>
              
              {q.type === 'multiple_choice' && q.options && (
                <div className="options-grid">
                  {q.options.map((opt, i) => (
                    <button 
                      key={i} 
                      className="option-btn"
                      onClick={() => handleOptionClick(q, opt)}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              )}

              {q.type === 'text' && (
                <div className="text-input-group">
                  <input 
                    type="text" 
                    value={textAnswers[q.id] || ''}
                    onChange={(e) => setTextAnswers({...textAnswers, [q.id]: e.target.value})}
                    onKeyDown={(e) => e.key === 'Enter' && handleTextSubmit(q)}
                    placeholder="Escribe tu respuesta aquí..."
                  />
                  <button onClick={() => handleTextSubmit(q)}>Enviar</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <style>{`
        .po-container {
          max-width: 700px;
          margin: 0 auto;
          font-family: 'Inter', system-ui, sans-serif;
        }
        .chat-history {
          margin-bottom: 24px;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .chat-bubble {
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          padding: 12px 16px;
          border-radius: 12px;
        }
        .q-text {
          display: block;
          font-size: 13px;
          color: #64748b;
          margin-bottom: 4px;
        }
        .a-text {
          display: block;
          font-weight: 500;
          color: #0f172a;
        }
        .question-card {
          background: #ffffff;
          border: 2px solid #38bdf8;
          border-radius: 16px;
          padding: 24px;
          box-shadow: 0 4px 20px rgba(56, 189, 248, 0.15);
          margin-bottom: 16px;
        }
        .question-card h3 {
          margin-top: 0;
          color: #0f172a;
          font-size: 18px;
        }
        .options-grid {
          display: grid;
          gap: 10px;
          margin-top: 16px;
        }
        .option-btn {
          padding: 12px 16px;
          background: #f1f5f9;
          border: 1px solid #cbd5e1;
          border-radius: 8px;
          text-align: left;
          cursor: pointer;
          font-size: 15px;
          transition: all 0.2s;
        }
        .option-btn:hover {
          background: #e0f2fe;
          border-color: #7dd3fc;
        }
        .text-input-group {
          display: flex;
          gap: 8px;
          margin-top: 16px;
        }
        .text-input-group input {
          flex: 1;
          padding: 12px;
          border: 1px solid #cbd5e1;
          border-radius: 8px;
        }
        .text-input-group button {
          padding: 0 20px;
          background: #0ea5e9;
          color: white;
          border: none;
          border-radius: 8px;
          cursor: pointer;
        }
        .pulse {
          animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
        }
        .loading-skeleton {
          padding: 24px;
          border: 1px solid #e2e8f0;
          border-radius: 16px;
        }
        .skeleton-line {
          height: 20px;
          background: #e2e8f0;
          border-radius: 4px;
          margin-bottom: 12px;
        }
        .skeleton-line.short {
          width: 60%;
        }
        .skeleton-box {
          height: 100px;
          background: #e2e8f0;
          border-radius: 8px;
          margin-top: 20px;
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: .5; }
        }
        .text-center { text-align: center; }
      `}</style>
    </div>
  );
};
