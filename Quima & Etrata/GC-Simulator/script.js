const TOTAL_MEMORY = 100;

let objects = [];
let usedMemory = 0;

function updateDashboard() {

    document.getElementById("usedMemory").innerText =
        usedMemory + " MB";

    document.getElementById("freeMemory").innerText =
        (TOTAL_MEMORY - usedMemory) + " MB";
}

function addLog(message) {

    const logs = document.getElementById("logs");

    const time = new Date().toLocaleTimeString();

    logs.innerHTML = `[${time}] ${message}<br>` + logs.innerHTML;
}

function createObject() {

    const name = document.getElementById("objectName").value;

    const size = parseInt(
        document.getElementById("objectSize").value
    );

    const gcMode = document.getElementById("gcMode").value;

    if (!name || !size) {
        alert("Please complete the fields.");
        return;
    }

    // In explicit mode, block immediately when limit reached
    if (gcMode === "explicit" && usedMemory + size > TOTAL_MEMORY) {
        alert("Not enough memory. Run Garbage Collector manually.");
        addLog("Memory allocation failed - manual GC required.");
        return;
    }

    // In implicit mode, block immediately when limit reached
    if (gcMode === "implicit" && usedMemory + size > TOTAL_MEMORY) {
        alert("Not enough memory.");
        addLog("Memory allocation failed - insufficient space.");
        return;
    }

    const object = {
        id: Date.now(),
        name,
        size,
        active: true,
        color: `hsl(${Math.random() * 360}, 70%, 60%)`
    };

    objects.push(object);

    usedMemory += size;

    renderObjects();

    updateDashboard();

    addLog(`${name} allocated ${size} MB.`);

    document.getElementById("objectName").value = "";
    document.getElementById("objectSize").value = "";

    // Auto release and clean when reaching 70MB threshold in implicit mode
    if (gcMode === "implicit" && usedMemory >= 70) {
        addLog("Memory threshold (70MB) reached! Auto-releasing old objects...");
        markOldestAsUnused();
        automaticGC();
    }
}

function renderObjects() {

    const container = document.getElementById("memoryContainer");

    container.innerHTML = "";

    objects.forEach(object => {

        const div = document.createElement("div");

        div.className = "memory-object";

        div.style.background = object.active
            ? object.color
            : "gray";

        div.innerHTML = `
            <div>
                <h3>${object.name}</h3>
                <p>${object.size} MB</p>
                <p>Status: ${object.active ? "Active" : "Unused"}</p>
            </div>

            <button onclick="releaseObject(${object.id})">
                Release
            </button>
        `;

        container.appendChild(div);
    });
}

function releaseObject(id) {

    const gcMode =
        document.getElementById("gcMode").value;

    objects = objects.map(object => {

        if (object.id === id) {
            object.active = false;

            addLog(`${object.name} marked as unused.`);
        }

        return object;
    });

    renderObjects();

    // Automatic cleanup in implicit mode
    if (gcMode === "implicit") {
        automaticGC();
    }
}

function runGC() {

    let removedMemory = 0;

    objects.forEach(object => {
        if (!object.active) {
            removedMemory += object.size;
        }
    });

    objects = objects.filter(object => object.active);

    usedMemory -= removedMemory;

    renderObjects();

    updateDashboard();

    addLog(`Garbage Collector cleaned ${removedMemory} MB.`);
}

function automaticGC() {

    let removedMemory = 0;

    objects.forEach(object => {
        if (!object.active) {
            removedMemory += object.size;
        }
    });

    objects = objects.filter(object => object.active);

    usedMemory -= removedMemory;

    renderObjects();

    updateDashboard();

    addLog("Implicit Garbage Collection executed automatically.");
}

function markOldestAsUnused() {
    // Mark the oldest 30% of objects as unused when memory is high
    const countToMark = Math.ceil(objects.length * 0.3);
    
    for (let i = 0; i < countToMark && i < objects.length; i++) {
        if (objects[i].active) {
            objects[i].active = false;
            addLog(`${objects[i].name} automatically marked as unused (memory threshold reached).`);
        }
    }
    
    renderObjects();
}

updateDashboard();