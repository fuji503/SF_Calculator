import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { Card } from '../../core/storage.ts'
import type { SimDefinition } from '../../sims/types.ts'
import { ResultCard } from './ResultCard.tsx'

interface Props {
  def: SimDefinition
  cards: Card[]
  update: (id: string, fn: (c: Card) => Card) => void
  duplicate: (id: string) => void
  remove: (id: string) => void
  move: (from: number, to: number) => void
}

/** カードの一覧。つまみ（⠿）のドラッグで並び替える。スマホでは長押ししてからドラッグする */
export function CardList({ def, cards, update, duplicate, remove, move }: Props) {
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return
    move(
      cards.findIndex((c) => c.id === e.active.id),
      cards.findIndex((c) => c.id === e.over!.id),
    )
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={cards.map((c) => c.id)} strategy={verticalListSortingStrategy}>
        <ol className="space-y-4">
          {cards.map((card, i) => (
            <SortableCard
              key={card.id}
              def={def}
              card={card}
              index={i}
              count={cards.length}
              update={update}
              duplicate={duplicate}
              remove={remove}
              move={move}
            />
          ))}
        </ol>
      </SortableContext>
    </DndContext>
  )
}

function SortableCard({
  def,
  card,
  index,
  count,
  update,
  duplicate,
  remove,
  move,
}: Omit<Props, 'cards'> & { card: Card; index: number; count: number }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: card.id })
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={isDragging ? 'relative z-10 opacity-80 shadow-2xl' : ''}
    >
      <ResultCard
        def={def}
        card={card}
        isFirst={index === 0}
        isLast={index === count - 1}
        onChange={(fn) => update(card.id, fn)}
        onDuplicate={() => duplicate(card.id)}
        onRemove={() => remove(card.id)}
        onMove={(dir) => move(index, index + dir)}
        handleRef={setActivatorNodeRef}
        handleProps={{ ...attributes, ...listeners }}
      />
    </li>
  )
}
