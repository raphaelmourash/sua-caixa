import React, { useState } from 'react';
import {
  DndContext,
  DragOverlay,
  closestCenter,
  PointerSensor,
  TouchSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from '@dnd-kit/sortable';
import { restrictToVerticalAxis } from '@dnd-kit/modifiers';
import { CSS } from '@dnd-kit/utilities';
import { useJukebox } from '../context/JukeboxContext';

// Visual da linha (usado na lista e também na cópia que gruda no mouse)
function TrackRow({ track, idx, isCurrent, onPlay, onRemove, overlay = false }) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '8px 12px',
        backgroundColor: isCurrent ? '#00889122' : '#111827',
        border: overlay ? '1px solid #22d3ee' : isCurrent ? '1px solid #008891' : '1px solid #1f2937',
        borderRadius: '6px',
        boxShadow: overlay ? '0 10px 24px rgba(0,0,0,0.7)' : 'none',
        cursor: overlay ? 'grabbing' : 'grab',
      }}
    >
      <span
        style={{ color: overlay ? '#22d3ee' : '#64748b', fontSize: '14px', marginRight: '6px', userSelect: 'none' }}
        title="Segure para arrastar"
      >
        ⋮⋮
      </span>

      <div
        onClick={overlay ? undefined : onPlay}
        style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', flex: 1, overflow: 'hidden' }}
        title="Clique para tocar esta faixa"
      >
        <span style={{ fontSize: '12px', color: isCurrent ? '#06b6d4' : '#94a3b8', fontWeight: 'bold' }}>
          {isCurrent ? '▶' : `${idx + 1}.`}
        </span>
        <span
          style={{
            fontSize: '13px',
            color: isCurrent ? '#f8fafc' : '#cbd5e1',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {track.title || track.id}
        </span>
      </div>

      <button
        onClick={overlay ? undefined : onRemove}
        onPointerDown={(e) => e.stopPropagation()} // clicar no X nunca inicia um arraste
        className="btn btn-red btn-sm"
        style={{ padding: '2px 6px', fontSize: '11px', marginLeft: '8px' }}
        title="Remover da fila"
      >
        ✕
      </button>
    </div>
  );
}

// Envolve a linha com o comportamento de "objeto arrastável"
function SortableTrack({ track, idx, isCurrent, onPlay, onRemove }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: track.queueId,
  });

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.3 : 1,
        touchAction: 'none',
      }}
    >
      <TrackRow track={track} idx={idx} isCurrent={isCurrent} onPlay={onPlay} onRemove={onRemove} />
    </div>
  );
}

export default function QueueDrawer({ isOpen, onClose }) {
  const { queue, currentIndex, playIndex, removeFromQueue, reorderQueue } = useJukebox();
  const [activeId, setActiveId] = useState(null);

  const sensors = useSensors(
    // só começa a arrastar depois de mover 6px: o clique simples continua tocando a faixa
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  if (!isOpen) return null;

  const activeIdx = queue.findIndex((t) => t.queueId === activeId);
  const activeTrack = activeIdx >= 0 ? queue[activeIdx] : null;

  const handleDragEnd = ({ active, over }) => {
    setActiveId(null);
    if (!over || active.id === over.id) return;
    const from = queue.findIndex((t) => t.queueId === active.id);
    const to = queue.findIndex((t) => t.queueId === over.id);
    if (from >= 0 && to >= 0) reorderQueue(from, to);
  };

  return (
    <div
      style={{
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
        padding: '20px',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '15px',
          borderBottom: '1px solid #1f2937',
          paddingBottom: '10px',
        }}
      >
        <div>
          <span style={{ fontSize: '15px', fontWeight: 'bold', color: '#06b6d4', display: 'block' }}>
            Fila de Reprodução ({queue.length})
          </span>
          <span style={{ fontSize: '11px', color: '#64748b' }}>💡 Arraste as músicas para reordenar</span>
        </div>
        <button onClick={onClose} className="btn btn-dark btn-sm" style={{ padding: '4px 10px' }}>
          ✕ Fechar
        </button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto' }}>
        {queue.length === 0 ? (
          <p style={{ color: '#64748b', fontSize: '13px', textAlign: 'center', marginTop: '40px' }}>
            A fila está vazia. Adicione músicas a partir de uma playlist!
          </p>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            modifiers={[restrictToVerticalAxis]}
            onDragStart={({ active }) => setActiveId(active.id)}
            onDragEnd={handleDragEnd}
            onDragCancel={() => setActiveId(null)}
          >
            <SortableContext items={queue.map((t) => t.queueId)} strategy={verticalListSortingStrategy}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {queue.map((track, idx) => (
                  <SortableTrack
                    key={track.queueId}
                    track={track}
                    idx={idx}
                    isCurrent={idx === currentIndex}
                    onPlay={() => playIndex(idx)}
                    onRemove={() => removeFromQueue(idx)}
                  />
                ))}
              </div>
            </SortableContext>

            {/* a música "levantada": acompanha o mouse enquanto os vizinhos abrem espaço */}
            <DragOverlay>
              {activeTrack ? (
                <TrackRow track={activeTrack} idx={activeIdx} isCurrent={activeIdx === currentIndex} overlay />
              ) : null}
            </DragOverlay>
          </DndContext>
        )}
      </div>
    </div>
  );
}
