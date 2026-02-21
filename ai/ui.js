export function highlight(direction) {
    const up = document.getElementById("keyUp");
    const down = document.getElementById("keyDown");
    const left = document.getElementById("keyLeft");
    const right = document.getElementById("keyRight");

    if (!up || !down || !left || !right) return;

    up.classList.remove("active");
    down.classList.remove("active");
    left.classList.remove("active");
    right.classList.remove("active");

    if (direction.x === 0 && direction.y === -1) up.classList.add("active");
    if (direction.x === 0 && direction.y === 1) down.classList.add("active");
    if (direction.x === -1 && direction.y === 0) left.classList.add("active");
    if (direction.x === 1 && direction.y === 0) right.classList.add("active");
}
