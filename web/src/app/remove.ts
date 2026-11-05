export interface DeleteSubject {
  kind: "project" | "diagram";
  name: string;
  diagrams: number;
  permanent: boolean;
}

export interface DeleteCopy {
  title: string;
  body: string;
  confirm: string;
}

/** The one or two questions asked before a library project or diagram is deleted. */
export function deleteWording(subject: DeleteSubject): DeleteCopy {
  const confirm = subject.permanent ? "Delete permanently" : "Move to Trash";
  if (subject.kind === "diagram") {
    const file = `${subject.name}.drawit.kdl`;
    return {
      title: subject.permanent ? `Delete "${subject.name}" permanently?` : `Delete "${subject.name}"?`,
      body: subject.permanent ? `This cannot be undone. ${file} will be removed from the disk.` : `${file} moves to the Trash.`,
      confirm,
    };
  }
  return {
    title: subject.permanent ? `Delete "${subject.name}" permanently?` : `Delete "${subject.name}"?`,
    body: projectBody(subject.diagrams, subject.permanent),
    confirm,
  };
}

function projectBody(diagrams: number, permanent: boolean): string {
  if (diagrams <= 0) {
    return permanent ? "This cannot be undone. The project will be removed from the disk." : "This project moves to the Trash.";
  }
  const diagramsText = diagrams === 1 ? "1 diagram" : `${String(diagrams)} diagrams`;
  return permanent
    ? `This cannot be undone. The project and its ${diagramsText} will be removed from the disk.`
    : `This project and its ${diagramsText} move to the Trash.`;
}
