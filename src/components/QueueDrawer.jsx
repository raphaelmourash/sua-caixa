import React, { useState } from 'react';
import { useJukebox } from '../context/JukeboxContext';

export default function QueueDrawer({ isOpen, onClose }) {
  const { queue, currentIndex, playIndex, removeFromQueue, reorderQueue } = useJukebox();
  const [draggedIdx, setDraggedIdx] = useState(null);

  if (!isOpen) return null;

  const handleDragStart = (e, idx) => {
    setDraggedIdx(idx);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e, idx) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e, targetIdx) => {
    e.preventDefault();
    if (draggedIdx !== null && draggedIdx !== targetIdx) {
      reorderQueue(draggedIdx, targetIdx);
    }
    setDraggedIdx(null);
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      right: 0,
      width: '380px',
      height: '100vh',
      backgroundColor: '#0b0f19',
      borderLeft: '1px solid #1f2937',
      boxShadow: '-10px 0 25px rgba(0,0,0,0.8)',
      zIndex: 150,
      display: 'flex',
      flexDirection: 'column',
      padding: '20px'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px', borderBottom: '1px solid #1f2937', paddingBottom: '10px' }}>
        <div>
          <span style={{ fontSize: '15px', fontWeight: 'bold', color: '#06b6d4', display: 'block' }}>
            Fila de Reprodução ({queue.length})
          </span>
          <span style={{ fontSize: '11px', color: '#64748b' }}>💡 Arraste as músicas para reordenar</span>
        </div>
        <button
          onClick={onClose}
          className="btn btn-dark btn-sm"
          style={{ padding: '4px 10px' }}
        >
          ✕ Fechar
        </button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {queue.length === 0 ? (
          <p style={{ color: '#64748b', fontSize: '13px', textAlign: 'center', marginTop: '40px' }}>
            A fila está vazia. Adicione músicas a partir de uma playlist!
          </p>
        ) : (
          queue.map((track, idx) => {
            const isCurrent = idx === currentIndex;
            const isBeingDragged = draggedIdx === idx;

            return (
              <div
                key={idx}
                draggable
                onDragStart={(e) => handleDragStart(e, idx)}
                onDragOver={(e) => handleDragOver(e, idx)}
                onDrop={(e) => handleDrop(e, idx)}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '8px 12px',
                  backgroundColor: isCurrent ? '#00889122' : '#111827',
                  border: isCurrent ? '1px solid #008891' : '1px solid #1f2937',
                  borderRadius: '6px',
                  opacity: isBeingDragged ? 0.4 : 1,
                  cursor: 'grab'
                }}
              >
                <span style={{ color: '#64748b', fontSize: '14px', marginRight: '6px', cursor: 'grab' }}>
                  ⋮⋮
                </span>

                <div
                  onClick={() => playIndex(idx)}
                  style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', flex: 1, overflow: 'hidden' }}
                  title="Clique para tocar esta faixa"
                >
                  <span style={{ fontSize: '12px', color: isCurrent ? '#06b6d4' : '#94a3b8', fontWeight: 'bold' }}>
                    {isCurrent ? '▶' : `${idx + 1}.`}
                  </span>
                  <span style={{ fontSize: '13px', color: isCurrent ? '#f8fafc' : '#cbd5e1', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {track.title || track.id}
                  </span>
                </div>

                <button
                  onClick={() => removeFromQueue(idx)}
                  className="btn btn-red btn-sm"
                  style={{ padding: '2px 6px', fontSize: '11px', marginLeft: '8px' }}
                  title="Remover da fila"
                >
                  ✕
                </button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}