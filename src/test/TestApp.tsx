import React from 'react';
import { DraggableLogo } from '../components/DraggableLogo';
import { HighlightsDrawer } from '../components/HighlightsDrawer';
import { SelectionPlusIcon } from '../components/SelectionPlusIcon';
import { useSelectionHandler } from './useSelectionHandler';
import { Agentation } from 'agentation';

export const TestApp: React.FC = () => {
  const { selectionState, handleSaveHighlight, isSaving, isSaved, isDismissing } = useSelectionHandler();

  return (
    <div className="flex h-screen w-screen overflow-hidden">
      <div className="w-1/2 bg-white overflow-auto">
        <article className="max-w-2xl mx-auto px-8 py-12 space-y-6">
          <h1 className="text-4xl font-bold mb-8">
            Everything That Turned Out Well in My Life Followed the Same Design Process
          </h1>

          <p className="text-lg leading-relaxed">
            The author observes that his most successful endeavors—marriage, essays, career—share
            a common approach: "unfolding," a concept from architect Christopher Alexander. Rather
            than imposing a predetermined vision, unfolding means paying attention to what you enjoy
            doing, then seeking more of it.
          </p>

          <p className="text-lg leading-relaxed">
            Making yourself accessible to interesting people and collaborating on projects. Iterating
            continuously—removing frustrations and expanding what makes you feel alive. Looking back
            to discover your life bears little resemblance to your original imagination, yet fits you
            perfectly.
          </p>

          <p className="text-lg leading-relaxed">
            Good design succeeds when "the form fits the context." A glove fits a hand; a healthy
            relationship fits its participants; an excellent essay aligns truth, writer's needs, and
            reader's mind. The context itself contains more wisdom than any individual can hold mentally.
          </p>

          <p className="text-lg leading-relaxed">
            The author warns against visions—fantasies that changing contexts solves problems. He
            recounts choosing political science based on romantic notions, only to discover after
            eighteen months it didn't suit him.
          </p>

          <p className="text-lg leading-relaxed">
            Observe your actual context carefully. Form mental models about it. Take small experimental
            steps based on those models. Act and gather new information. Repeat continuously. The author
            emphasizes that increasing information flow from reality and acting quickly on feedback
            accelerates unfolding.
          </p>

          <p className="text-lg leading-relaxed">
            Unbundling assumptions, overcoming social fear, and maintaining detachment from predetermined
            outcomes all enhance the process. Over a decade of sustained cycling through this feedback
            loop yields a well-designed life.
          </p>
        </article>
      </div>
      <div className="w-1/2 bg-bg-main" />
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
