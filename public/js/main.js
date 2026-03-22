// Carousel

const images = document.querySelectorAll(".carousel-img");
let index = 0;

function showImage(i){
    images.forEach(img => img.classList.remove("active"));
    images[i].classList.add("active");
}

document.getElementById("nextBtn")?.addEventListener("click", () => {
    index++;
    if(index >= images.length) index = 0;
    showImage(index);
});

document.getElementById("prevBtn")?.addEventListener("click", () => {
    index--;
    if(index < 0) index = images.length - 1;
    showImage(index);
});


// Page fade transition

document.querySelectorAll("a").forEach(link => {

    link.addEventListener("click", function(e){

        const url = this.href;

        if(url && !url.startsWith("#")){
            e.preventDefault();

            document.body.classList.add("fade-out");

            setTimeout(() => {
                window.location = url;
            }, 350);
        }
    });

});