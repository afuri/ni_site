import React from "react";
import catImage from "../assets/cat.png";
import { PlatformIcon } from "./PlatformIcon";

export function SubjectVisual({ hero = false }: { hero?: boolean }) {
  return <div className={`student-subject-visual${hero ? " is-hero" : ""}`} aria-hidden="true">
    <span className="student-subject-orbit" />
    <span className="student-subject-symbol">∑</span>
    {hero ? <img className="student-integralik" src={catImage} alt="" /> : <i><PlatformIcon name="trophy" size={34} /></i>}
  </div>;
}
