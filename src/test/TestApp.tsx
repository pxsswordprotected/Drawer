import React, { useEffect, useRef } from 'react';
import { DraggableLogo } from '../components/DraggableLogo';
import { HighlightsDrawer } from '../components/HighlightsDrawer';
import { SelectionPlusIcon } from '../components/SelectionPlusIcon';
import { useSelectionHandler } from './useSelectionHandler';
import { useDrawerStore } from '@/store/drawerStore';
import { removeHighlightMarks } from '../content/pageHighlighter';
import { Agentation } from 'agentation';

export const TestApp: React.FC = () => {
  const { selectionState, handleSaveHighlight, isSaving, isSaved, isDismissing } =
    useSelectionHandler();

  const allHighlights = useDrawerStore((s) => s.allHighlights);
  const prevIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const currentIds = new Set(allHighlights.map((h) => h.id));
    for (const id of prevIdsRef.current) {
      if (!currentIds.has(id)) {
        removeHighlightMarks(id);
      }
    }
    prevIdsRef.current = currentIds;
  }, [allHighlights]);

  return (
    <div className="flex h-screen w-screen overflow-hidden">
      <div className="w-1/2 bg-[#fdfdfd] overflow-auto scrollbar-hide">
        <article className="max-w-2xl mx-auto px-8 py-12 space-y-6">
          <h1 className="text-4xl font-bold mb-8">
            Everything That Turned Out Well in My Life Followed the Same Design Process
          </h1>

          <p className="text-lg leading-relaxed">
            The author observes that his most successful endeavors—marriage, essays, career—share a
            common approach: "unfolding," a concept from architect Christopher Alexander. Rather
            than imposing a predetermined vision, unfolding means paying attention to what you enjoy
            doing, then seeking more of it.
          </p>

          <p className="text-lg leading-relaxed">
            Making yourself accessible to interesting people and collaborating on projects.
            Iterating continuously—removing frustrations and expanding what makes you feel alive.
            Looking back to discover your life bears little resemblance to your original
            imagination, yet fits you perfectly.
          </p>

          <p className="text-lg leading-relaxed">
            Good design succeeds when "the form fits the context." A glove fits a hand; a healthy
            relationship fits its participants; an excellent essay aligns truth, writer's needs, and
            reader's mind. The context itself contains more wisdom than any individual can hold
            mentally.
          </p>

          <p className="text-lg leading-relaxed">
            The author warns against visions—fantasies that changing contexts solves problems. He
            recounts choosing political science based on romantic notions, only to discover after
            eighteen months it didn't suit him.
          </p>

          <p className="text-lg leading-relaxed">
            Observe your actual context carefully. Form mental models about it. Take small
            experimental steps based on those models. Act and gather new information. Repeat
            continuously. The author emphasizes that increasing information flow from reality and
            acting quickly on feedback accelerates unfolding.
          </p>

          <p className="text-lg leading-relaxed">
            Unbundling assumptions, overcoming social fear, and maintaining detachment from
            predetermined outcomes all enhance the process. Over a decade of sustained cycling
            through this feedback loop yields a well-designed life.
          </p>
        </article>
      </div>
      <div className="w-1/2 bg-bg-main overflow-auto scrollbar-hide">
        <article className="max-w-2xl mx-auto px-8 py-12 space-y-6 text-text-main">
          <h1 className="text-4xl font-bold mb-8">
            Being Open to Your Own Body
          </h1>

          <p className="text-lg leading-relaxed">
            Being open to your own body, being embodied, is a precondition for vibing. Which is why
            nerds can't vibe. The deepest limitation: all of these are still me generating the
            "other perspective" from my own weights.
          </p>

          <p className="text-lg leading-relaxed">
            There's something about physical awareness, proprioception, and the felt sense of being
            in a body that goes beyond intellectual understanding. The disconnect between thinking
            and feeling prevents the kind of open, responsive engagement that presence requires.
          </p>

          <p className="text-lg leading-relaxed">
            You can't unfold if you're not in touch with what your body is telling you about the
            current moment. The information is there — in tension, in breath, in the subtle
            orientation of attention — but it requires a different kind of listening.
          </p>

          <p className="text-lg leading-relaxed">
            Software should be warm to the touch. It should feel like it was made by a person who
            cared, not a committee that compromised. The best interface is one that disappears
            entirely, letting the user interact directly with the content they care about.
          </p>
        </article>
      </div>
      <DraggableLogo />
      <HighlightsDrawer />
      <SelectionPlusIcon
        visible={selectionState.visible}
        x={selectionState.x}
        y={selectionState.y}
        onClick={handleSaveHighlight}
        disabled={isSaving}
        isSuccess={isSaved}
        isDismissing={isDismissing}
      />
    </div>
  );
};
