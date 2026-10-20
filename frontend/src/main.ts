import { mount } from "svelte";
import App from "./app/App.svelte";
import "./styles/variables.css";
import "./styles/bootstrap.css";
const target = document.getElementById("app");

if (!target) {
	throw new Error("Application mount element is missing.");
}

mount(App, { target });
