import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { useAuth } from "@clerk/react";
import { PROBLEMS } from "../data/problems";
import Navbar from "../components/navbar";

import { Group, Panel, Separator } from "react-resizable-panels";
import ProblemDescription from "../components/ProblemDescription";
import OutputPanel from "../components/OutputPanel";
import CodeEditorPanel from "../components/CodeEditorPanel";
import { executeCode, warmUpPython } from "../lib/codeRunner";

import toast from "react-hot-toast";
import { checkIfTestsPassed, triggerConfetti, triggerWrongFlash } from "../lib/utils";

function ProblemPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { getToken } = useAuth();

  const [currentProblemId, setCurrentProblemId] = useState("two-sum");
  const [selectedLanguage, setSelectedLanguage] = useState("javascript");
  const [code, setCode] = useState(PROBLEMS[currentProblemId].starterCode.javascript);
  const [output, setOutput] = useState(null);
  const [isRunning, setIsRunning] = useState(false);

  const currentProblem = PROBLEMS[currentProblemId];

  // preload the in-browser Python runtime (does nothing if Python runs on the server)
  useEffect(() => {
    warmUpPython();
  }, []);

  // update problem when URL param changes
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (id && PROBLEMS[id]) {
      setCurrentProblemId(id);
      setCode(PROBLEMS[id].starterCode[selectedLanguage]);
      setOutput(null);
    }
  }, [id, selectedLanguage]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const handleLanguageChange = (e) => {
    const newLang = e.target.value;
    setSelectedLanguage(newLang);
    setCode(currentProblem.starterCode[newLang]);
    setOutput(null);
  };

  const handleProblemChange = (newProblemId) => navigate(`/problem/${newProblemId}`);

  const handleRunCode = async () => {
    setIsRunning(true);
    setOutput(null);

    try {
      const token = await getToken();
      const result = await executeCode(selectedLanguage, code, token);
      setOutput(result);

      if (result.success) {
        const expectedOutput = currentProblem.expectedOutput[selectedLanguage];
        const testsPassed = checkIfTestsPassed(result.output, expectedOutput);

        if (testsPassed) {
          triggerConfetti();
          toast.success("All tests passed! Great job!");
        } else {
          triggerWrongFlash();
          toast.error("Tests failed. Check your output!");
        }
      } else {
        triggerWrongFlash();
        toast.error(result.error || "Code execution failed!");
      }
    } catch (err) {
      console.error(err);
      triggerWrongFlash();
      toast.error("Something went wrong running your code.");
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div className="h-screen bg-base-100 flex flex-col">
      <Navbar />

      <div className="flex-1 min-h-0">
        <Group orientation="horizontal" className="h-full">
          {/* left panel- problem desc */}
          <Panel defaultSize="40%" minSize="30%">
            <ProblemDescription
              problem={currentProblem}
              currentProblemId={currentProblemId}
              onProblemChange={handleProblemChange}
              allProblems={Object.values(PROBLEMS)}
            />
          </Panel>

          <Separator className="w-2 bg-base-300 hover:bg-orange-500 transition-colors cursor-col-resize" />

          {/* right panel- code editor & output */}
          <Panel defaultSize="60%" minSize="30%">
            <Group orientation="vertical">
              {/* Top panel - Code editor */}
              <Panel defaultSize="70%" minSize="30%">
                <CodeEditorPanel
                  selectedLanguage={selectedLanguage}
                  code={code}
                  isRunning={isRunning}
                  onLanguageChange={handleLanguageChange}
                  onCodeChange={setCode}
                  onRunCode={handleRunCode}
                />
              </Panel>

              <Separator className="h-2 bg-base-300 hover:bg-orange-500 transition-colors cursor-row-resize" />

              {/* Bottom panel - Output Panel*/}
              <Panel defaultSize="30%" minSize="30%">
                <OutputPanel output={output} />
              </Panel>
            </Group>
          </Panel>
        </Group>
      </div>
    </div>
  );
}

export default ProblemPage;